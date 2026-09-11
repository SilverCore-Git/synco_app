// ============================================
// Utilities Crypto pour Webhooks
// Fonctions de base pour la génération de tokens et signatures
// ============================================

// ============================================
// Génération de tokens et secrets
// ============================================

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Obtient un caractère base62 à un index donné (circulaire)
 */
function getBase62Char(index: number): string {
  return BASE62_CHARS.charAt(index % BASE62_CHARS.length)!;
}

/**
 * Génère un token URL-safe aléatoire
 * 24 caractères base62 (≈ 144 bits d'entropie)
 */
export function generateWebhookToken(): string {
  return generateRandomBase62(24);
}

/**
 * Génère un secret HMAC
 * 36 caractères base62 (≈ 216 bits d'entropie)
 */
export function generateWebhookSecret(): string {
  return generateRandomBase62(36);
}

/**
 * Génère une chaîne base62 aléatoire
 * Un octet CSPRNG par caractère de sortie (jamais de Math.random).
 */
function generateRandomBase62(targetLength: number): string {
  const array = new Uint8Array(targetLength);
  crypto.getRandomValues(array);

  let result = '';
  for (let i = 0; i < array.length; i++) {
    result += getBase62Char(array[i] as number);
  }

  return result;
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
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  
  return Array.from(new Uint8Array(signatureBuffer))
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
    timestamp: match[1]!,
    signature: match[2]!
  };
}

/**
 * Génère le header de signature
 */
export function generateSignatureHeader(timestamp: string, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
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
// Helpers de conversion
// ============================================

/**
 * Convertit un ArrayBuffer en base64
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Convertit une chaîne base64 en ArrayBuffer
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
