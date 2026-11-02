# NF1 — PIN v3 : le serveur peut toujours retrouver la clé privée E2EE de n'importe quel utilisateur par force brute hors ligne

|  |  |
|---|---|
| **Sévérité** | 🔴 Critique |
| **OWASP** | A02:2021 — Cryptographic Failures · A04:2021 — Insecure Design |
| **CWE** | CWE-916 — Use of Password Hash With Insufficient Computational Effort · CWE-521 — Weak Password Requirements · CWE-602 — Client-Side Enforcement of Server-Side Security |
| **Fichiers** | [`src/assets/utils/crypto.ts:23-38`, `:676-722`](../../src/assets/utils/crypto.ts) · [`src/App.vue:93-100`, `:185`, `:225`](../../src/App.vue) · API : [`synco_api/prisma/schema.prisma:129-136`](../../../synco_api/prisma/schema.prisma) (`UserPinSecret`) · [`synco_api/src/routes/users.ts:266-320`](../../../synco_api/src/routes/users.ts) |
| **CVSS 3.1 (estimé)** | 8.7 — `AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:N` (attaquant = serveur ou détenteur d'un dump de base + clé de chiffrement des champs) |
| **Statut** | ♻️ **Persistante** — FC2 du 01/10 corrigée seulement pour son volet « comptes legacy » (commits `518305b`, `2414ffd`) ; le cœur du constat reste entier. ⚠️ confirmé par revue de code |

---

## Description et localisation

Depuis le 01/10, les nouveaux comptes et les comptes legacy migrés utilisent bien le schéma v3. Les éléments du schéma :

```ts
// crypto.ts:676 — unlockKey = PBKDF2-SHA256(PIN 4 chiffres, sel, 210 000 itérations)
async function deriveUnlockKeyV3(pin, rawSalt) { ... iterations: PIN_ITERATIONS_V3 ... }

// crypto.ts:690 — verifier = HMAC(unlockKey, "synco-pin-verifier-v3"), stocké côté serveur
async function deriveVerifierV3(unlockKeyBytes) { ... }

// crypto.ts:704 — masterKey = HKDF(unlockKey, sel = wrapSecret) ; chiffre la clé privée RSA
async function deriveMasterKeyV3(unlockKeyBytes, wrapSecretBytes) { ... }
```

Le serveur stocke, pour chaque utilisateur :

| Donnée | Table | Rôle |
|---|---|---|
| `pinSalt` (`v3:…`) | `users` | sel du PBKDF2 |
| `encryptedPrivateKey`, `keyIv` | `users` | clé privée RSA chiffrée |
| `verifier` | `user_pin_secrets` | HMAC dérivé **uniquement** du PIN et du sel |
| `wrapSecret` | `user_pin_secrets` | second facteur, **lui aussi côté serveur** |

Le serveur détient donc tout ce qu'il faut pour tester les 10 000 PIN possibles hors ligne, sans passer par son propre verrou :

```
pour pin de 0000 à 9999 :
    u = PBKDF2(pin, sel, 210 000)          # ~0,1 s/cœur → 10 000 essais ≈ 1 à 2 min sur 12 cœurs
    si HMAC(u, "synco-pin-verifier-v3") == verifier : 
        mk = HKDF(u, wrapSecret) ; privateKey = AES-GCM-dec(mk, encryptedPrivateKey)
```

Le verrou exponentiel de `POST /me/pin/unlock` (désormais réellement appelé par l'app) ne protège que contre un attaquant **en ligne extérieur**. Or le modèle de menace annoncé par Synco (E2EE, « le serveur est non fiable ») est précisément le serveur. Le chiffrement des champs (`prisma-field-encryption`) ne change rien : la clé est dans l'environnement du même serveur.

Contrairement à ce qu'affirme le commentaire de `crypto.ts:26-31`, le `wrapSecret` n'est pas « cryptographiquement insuffisant à voler » : il est stocké à côté du verifier.

## Impact

- **Compromission de toute l'E2EE** pour quiconque contrôle le serveur ou une sauvegarde de sa base avec la clé des champs (administrateur malveillant, réquisition, intrusion, fuite de sauvegarde). Avec la clé privée RSA, il ouvre toutes les `ThreadKey`, `WorkspaceKey`, `DMConversationKey` et `AiSessionKey` de l'utilisateur, donc tout l'historique et les futurs messages.
- Coût : quelques minutes de calcul par utilisateur, parallélisable sur toute la base.

## Preuve de concept / scénario d'exploitation

La PoC de FC2 (01/10) reste valable sans modification (≈ 23 s pour 10 000 essais sur 12 cœurs). Esquisse :

```js
// node poc.mjs <pinSalt sans "v3:"> <verifier b64> <wrapSecret b64> <encryptedPrivateKey> <iv>
const { subtle } = globalThis.crypto;
for (let p = 0; p < 10000; p++) {
  const pin = String(p).padStart(4, '0');
  const base = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const u = await subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 210000, hash: 'SHA-256' }, base, 256);
  const h = await subtle.importKey('raw', u, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const v = Buffer.from(await subtle.sign('HMAC', h, new TextEncoder().encode('synco-pin-verifier-v3'))).toString('base64');
  if (v === verifier) { console.log('PIN =', pin); break; }
}
```

## Recommandation de remédiation

Le problème est structurel : un secret à 13 bits d'entropie ne peut pas être protégé contre la partie qui détient à la fois le vérificateur et le second facteur. Options, de la plus robuste à la plus simple :

1. **Le second facteur ne doit pas être lisible par l'application serveur** : `wrapSecret` conservé dans un HSM / KMS qui applique lui-même la limitation de débit (l'application ne voit jamais la valeur, seulement « accepté / refusé + secret chiffré pour le client »), ou un service séparé à la manière de la « Secure Value Recovery » de Signal (enclave + limitation de débit).
2. **Supprimer le vérificateur testable hors ligne** : protocole OPAQUE (PAKE asymétrique), où le serveur ne stocke rien qui permette de tester un PIN sans interaction.
3. **À défaut**, imposer une phrase secrète ou un PIN long (≥ 8 caractères alphanumériques, ou ≥ 10 chiffres) dérivé par Argon2id (mémoire ≥ 64 Mio), et cesser d'affirmer dans l'UI et la documentation que le serveur ne peut pas accéder aux messages.
4. Proposer une clé de récupération hors ligne (à la manière de Matrix SSSS) en alternative au PIN.

Le correctif de QA1 côté API (fuite des champs E2EE à d'autres membres) reste un prérequis : il est en place et vérifié statiquement (tests `pentest-2026-09-20.static`).
