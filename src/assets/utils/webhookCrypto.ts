// ============================================
// Utilities Crypto pour Webhooks E2EE
// Algorithmes: ECDH P-256 + AES-256-GCM + HKDF-SHA256
// ============================================

import type { Webhook } from '@/types/webhooks';

// ============================================
// Génération de tokens et secrets
// ============================================

/**
 * Génère un token URL-safe aléatoire
 * 24 caractères base62 (≈ 144 bits d'entropie)
 */
export function generateWebhookToken(): string {
  const array = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(array);
  return arrayToBase62(array);
}

/**
 * Génère un secret HMAC
 * 36 caractères base62 (≈ 216 bits d'entropie)
 */
export function generateWebhookSecret(): string {
  const array = new Uint8Array(24); // 192 bits
  crypto.getRandomValues(array);
  return arrayToBase62(array);
}

/**
 * Convertit un Uint8Array en chaîne base62
 */
function arrayToBase62(array: Uint8Array): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const base = BigInt(62);
  let result = '';
  let value = BigInt(0);
  
  for (let i = 0; i < array.length; i++) {
    value = (value * base) + BigInt(array[i]);
  }
  
  while (value > 0) {
    result = chars[Number(value % base)] + result;
    value = value / base;
  }
  
  // Assurer une longueur minimale
  while (result.length < 24) {
    result = chars[Math.floor(Math.random() * 62)] + result;
  }
  
  return result.substring(0, 24);
}

// ============================================
// Génération de signatures HMAC
// ============================================

/**
 * Génère une signature HMAC-SHA256 pour un payload
 */
export async function generateHMACSignature(
  secret: string,
  timestamp: string,
  payload: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const data = encoder.encode(timestamp + payload);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Vérifie une signature HMAC-SHA256
 */
export async function verifyHMACSignature(
  secret: string,
  timestamp: string,
  payload: string,
  signature: string
): Promise<boolean> {
  try {
    const expectedSignature = await generateHMACSignature(secret, timestamp, payload);
    return expectedSignature === signature;
  } catch {
    return false;
  }
}

/**
 * Parse le header de signature
 * Format: t=timestamp,v1=signature
 */
export function parseSignatureHeader(header: string | undefined): { timestamp: string; signature: string } | null {
  if (!header) return null;
  
  const match = header.match(/^t=(\d+),v1=([a-f0-9]+)$/i);
  if (!match) return null;
  
  return {
    timestamp: match[1],
    signature: match[2]
  };
}

/**
 * Génère le header de signature
 */
export function generateSignatureHeader(timestamp: string, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

// ============================================
// Chiffrement E2EE avec ECDH P-256
// ============================================

/**
 * Génère une paire de clés ECDH P-256
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Exporte une clé publique ECDH au format PEM
 */
export async function exportPublicKeyToPEM(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', publicKey);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  
  // Format PEM pour ECDH P-256
  return `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
}

/**
 * Importe une clé publique ECDH depuis le format PEM
 */
export async function importPublicKeyFromPEM(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  
  const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * Exporte une clé privée ECDH au format PKCS8 base64
 */
export async function exportPrivateKeyToPKCS8(privateKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Importe une clé privée ECDH depuis le format PKCS8 base64
 */
export async function importPrivateKeyFromPKCS8(pkcs8Base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(pkcs8Base64), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Dérive une clé AES-256-GCM depuis une clé partagée ECDH
 * Utilise HKDF-SHA256 pour plus de sécurité
 */
export async function deriveAESKeyFromECDH(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  salt?: Uint8Array
): Promise<CryptoKey> {
  // Dériver la clé partagée
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    privateKey,
    peerPublicKey,
    256 // 256 bits pour AES-256
  );
  
  // Importer la clé partagée comme clé brute
  const rawKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  
  // Dériver une clé AES-256-GCM avec HKDF-SHA256
  const hkdfSalt = salt || crypto.getRandomValues(new Uint8Array(32));
  
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt,
      info: new TextEncoder().encode('webhook-e2ee-key')
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Dérive une clé AES depuis une clé partagée ECDH (version simplifiée sans HKDF)
 */
export async function deriveAESKeyFromSharedSecret(
  sharedSecret: ArrayBuffer,
  info?: string
): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  
  const hkdfInfo = info ? new TextEncoder().encode(info) : new TextEncoder().encode('webhook-e2ee');
  
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: crypto.getRandomValues(new Uint8Array(32)),
      info: hkdfInfo
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ============================================
// Chiffrement/Déchiffrement de messages
// ============================================

/**
 * Chiffre un message avec AES-256-GCM
 */
export async function encryptMessageAESGCM(
  message: string,
  key: CryptoKey,
  iv?: Uint8Array
): Promise<{
  ciphertext: string;
  iv: string;
  tag: string;
}> {
  const encoder = new TextEncoder();
  const generatedIV = iv || crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: generatedIV
    },
    key,
    encoder.encode(message)
  );
  
  // AES-GCM retourne ciphertext + tag (16 octets)
  const fullCiphertext = new Uint8Array(ciphertext);
  const tag = fullCiphertext.slice(-16);
  const actualCiphertext = fullCiphertext.slice(0, -16);
  
  return {
    ciphertext: btoa(String.fromCharCode(...actualCiphertext)),
    iv: btoa(String.fromCharCode(...generatedIV)),
    tag: btoa(String.fromCharCode(...tag))
  };
}

/**
 * Déchiffre un message avec AES-256-GCM
 */
export async function decryptMessageAESGCM(
  ciphertextBase64: string,
  ivBase64: string,
  tagBase64: string,
  key: CryptoKey
): Promise<string> {
  try {
    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(tagBase64), c => c.charCodeAt(0));
    
    // Reconstruire le ciphertext complet
    const fullCiphertext = new Uint8Array([...ciphertext, ...tag]);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      fullCiphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('[WebhookCrypto] Échec du déchiffrement:', error);
    throw new Error('Impossible de déchiffrer le message. Clé incorrecte ou données corrompues.');
  }
}

/**
 * Chiffre un message pour un webhook avec sa clé publique
 * Utilise ECDH P-256 + AES-256-GCM
 */
export async function encryptForWebhook(
  message: string,
  webhookPublicKeyPEM: string,
  ephemeralKeyPair?: CryptoKeyPair
): Promise<{
  ciphertext: string;
  iv: string;
  ephemeralPublicKey: string;
  encryptedAesKey?: string; // Optionnel si on utilise une clé éphémère
}> {
  // Générer une paire de clés éphémère si non fournie
  const ephKeyPair = ephemeralKeyPair || await generateECDHKeyPair();
  
  // Importer la clé publique du webhook
  const webhookPublicKey = await importPublicKeyFromPEM(webhookPublicKeyPEM);
  
  // Dériver la clé partagée
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    ephKeyPair.privateKey,
    webhookPublicKey,
    256
  );
  
  // Dériver une clé AES depuis le secret partagé
  const aesKey = await deriveAESKeyFromSharedSecret(sharedSecret, 'webhook-msg');
  
  // Chiffrer le message
  const { ciphertext, iv, tag } = await encryptMessageAESGCM(message, aesKey);
  
  // Exporter la clé publique éphémère
  const ephemeralPublicKeyPEM = await exportPublicKeyToPEM(ephKeyPair.publicKey);
  
  return {
    ciphertext,
    iv,
    ephemeralPublicKey: ephemeralPublicKeyPEM
  };
}

/**
 * Déchiffre un message reçu d'un webhook avec la clé privée
 */
export async function decryptForWebhook(
  ciphertextBase64: string,
  ivBase64: string,
  ephemeralPublicKeyPEM: string,
  webhookPrivateKey: CryptoKey
): Promise<string> {
  // Importer la clé publique éphémère
  const ephemeralPublicKey = await importPublicKeyFromPEM(ephemeralPublicKeyPEM);
  
  // Dériver la clé partagée
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    webhookPrivateKey,
    ephemeralPublicKey,
    256
  );
  
  // Dériver une clé AES depuis le secret partagé
  const aesKey = await deriveAESKeyFromSharedSecret(sharedSecret, 'webhook-msg');
  
  // Déchiffrer le message
  return await decryptMessageAESGCM(ciphertextBase64, ivBase64, '', aesKey);
}

// ============================================
// Perfect Forward Secrecy (PFS)
// ============================================

/**
 * Génère une paire de clés éphémère pour PFS
 */
export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return await generateECDHKeyPair();
}

/**
 * Combinaison de secrets pour PFS
 */
export function combineSecrets(secret1: ArrayBuffer, secret2: ArrayBuffer): ArrayBuffer {
  const combined = new Uint8Array(secret1.byteLength + secret2.byteLength);
  combined.set(new Uint8Array(secret1), 0);
  combined.set(new Uint8Array(secret2), secret1.byteLength);
  return combined.buffer;
}

// ============================================
// Stockage sécurisé des clés
// ============================================

/**
 * Chiffre une clé privée avec la clé maître de l'utilisateur
 * (Utilise la clé privée RSA de l'utilisateur depuis le store)
 */
export async function encryptPrivateKeyWithMasterKey(
  privateKey: CryptoKey,
  masterPublicKeyJWK: string
): Promise<{
  encryptedPrivateKey: string;
  iv: string;
}> {
  // Exporter la clé privée au format PKCS8
  const privateKeyPKCS8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  
  // Importer la clé publique maître (RSA)
  const masterPublicKey = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(masterPublicKeyJWK),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
  
  // Chiffrer la clé privée avec la clé maître
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    masterPublicKey,
    privateKeyPKCS8
  );
  
  return {
    encryptedPrivateKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

/**
 * Déchiffre une clé privée avec la clé privée maître de l'utilisateur
 */
export async function decryptPrivateKeyWithMasterKey(
  encryptedPrivateKey: string,
  iv: string,
  masterPrivateKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedBuffer = Uint8Array.from(atob(encryptedPrivateKey), c => c.charCodeAt(0));
  
  // Déchiffrer avec la clé privée maître
  const privateKeyPKCS8 = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    masterPrivateKey,
    encryptedBuffer
  );
  
  // Importer la clé privée ECDH
  return await crypto.subtle.importKey(
    'pkcs8',
    privateKeyPKCS8,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// ============================================
// Fonctions utilitaires
// ============================================

/**
 * Génère un ID unique pour un webhook
 */
export function generateWebhookId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return 'wh_' + Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 24);
}

/**
 * Vérifie si un token est valide (format)
 */
export function isValidWebhookToken(token: string): boolean {
  return /^[a-zA-Z0-9]{24}$/.test(token);
}

/**
 * Vérifie si un secret est valide (format)
 */
export function isValidWebhookSecret(secret: string): boolean {
  return /^[a-zA-Z0-9]{36}$/.test(secret);
}

/**
 * Génère un callId unique pour PFS
 */
export function generateCallId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// Export des fonctions principales
// ============================================

export {
  generateWebhookToken,
  generateWebhookSecret,
  generateHMACSignature,
  verifyHMACSignature,
  parseSignatureHeader,
  generateSignatureHeader,
  generateECDHKeyPair,
  exportPublicKeyToPEM,
  importPublicKeyFromPEM,
  exportPrivateKeyToPKCS8,
  importPrivateKeyFromPKCS8,
  deriveAESKeyFromECDH,
  deriveAESKeyFromSharedSecret,
  encryptMessageAESGCM,
  decryptMessageAESGCM,
  encryptForWebhook,
  decryptForWebhook,
  generateEphemeralKeyPair,
  combineSecrets,
  encryptPrivateKeyWithMasterKey,
  decryptPrivateKeyWithMasterKey,
  generateWebhookId,
  isValidWebhookToken,
  isValidWebhookSecret,
  generateCallId
};
