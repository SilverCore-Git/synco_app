# 01 — Fondations cryptographiques : identité, code PIN, confiance

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/assets/utils/crypto.ts`](../../src/assets/utils/crypto.ts), [`synco_app/src/App.vue`](../../src/App.vue), [`synco_app/src/assets/utils/keyTrust.ts`](../../src/assets/utils/keyTrust.ts), [`src/services/pinSecurityService.ts`](../../../synco_api/src/services/pinSecurityService.ts) |
| **Modèles Prisma** | `User`, `UserPinSecret` |
| **Statut E2EE** | ✅ Fondation E2EE — la clé privée n'est **jamais** disponible en clair côté serveur |

---

## 1. L'identité cryptographique de l'utilisateur

Tout l'E2EE de Synco repose sur **une paire de clés RSA par utilisateur**, générée dans le navigateur au tout premier déverrouillage.

```
crypto.subtle.generateKey({
    name: "RSA-OAEP",
    modulusLength: 4096,
    publicExponent: 65537,
    hash: "SHA-256"
}, true, ["encrypt", "decrypt"])
```

- **Clé publique** : exportée en JWK, sérialisée en JSON, envoyée au serveur, stockée dans `User.publicKey`. C'est elle que les autres membres utilisent pour sceller les clés symétriques à votre intention.
- **Clé privée** : exportée en PKCS#8, **chiffrée localement** en AES-256-GCM avec une clé maître dérivée du code PIN, puis envoyée au serveur sous forme chiffrée uniquement (`User.encryptedPrivateKey` + `User.keyIv`).

Détail important : après le chiffrement, la clé privée est **réimportée en version non extractible** (`extractable = false`) avant d'être placée dans l'état applicatif (`privateKey` ref). Même une injection JavaScript dans la page ne peut donc pas exporter la clé privée en clair — elle peut seulement l'utiliser pour déchiffrer tant que la session est déverrouillée.

La clé privée **ne vit qu'en mémoire vive**, dans un `ref` Vue au niveau module. Elle n'est jamais écrite dans `localStorage`, `sessionStorage` ni IndexedDB. Un rechargement de page = re-saisie du PIN.

`lockSecurity()` remet simplement `privateKey.value = null` : verrouiller revient à oublier la clé.

## 2. Le code PIN — trois générations coexistantes

Le préfixe de `User.pinSalt` identifie le schéma utilisé par le compte. Les trois coexistent en production pour ne verrouiller aucun compte existant.

### 2.1 Schéma « legacy » (aucun préfixe)

- PIN à **4 chiffres**.
- `masterKey = PBKDF2-SHA256(pin, salt, 100 000 itérations) → AES-GCM 256`.
- Défense **entièrement côté client**. Un attaquant qui vole le triplet (`encryptedPrivateKey`, `keyIv`, `pinSalt`) peut tester les 10 000 PIN possibles hors ligne.

> Le code documente explicitement pourquoi le compteur d'itérations n'a pas été relevé globalement : cela aurait changé la clé maître dérivée de **tous** les comptes existants et les aurait définitivement verrouillés.

### 2.2 Schéma `v2:`

- PIN de **6 à 10 chiffres**.
- `masterKey = PBKDF2-SHA256(pin, salt, 600 000 itérations)` — recommandation OWASP 2023.
- Toujours entièrement côté client, mais l'espace de recherche et le coût de dérivation rendent la force brute hors ligne bien plus coûteuse.

### 2.3 Schéma `v3:` — **le schéma cible actuel**

C'est le schéma utilisé pour **toute nouvelle création et toute réinitialisation** de PIN. Il revient à 4 chiffres pour l'ergonomie, en déplaçant la barrière anti-force-brute du client vers le serveur.

```
unlockKey  = PBKDF2-SHA256(pin, rawSalt, 210 000 itérations, 256 bits)
verifier   = HMAC-SHA256(unlockKey, "synco-pin-verifier-v3")        → envoyé au serveur
wrapSecret = 32 octets aléatoires                                    → stocké côté serveur
masterKey  = HKDF-SHA256(ikm = unlockKey, salt = wrapSecret,
                         info = "synco-pin-masterkey-v3")            → AES-GCM 256
```

Propriétés :

1. **Le serveur n'apprend jamais le PIN.** Il ne reçoit que `verifier`, un HMAC à sens unique. Il ne peut pas remonter à `unlockKey`, encore moins au PIN.
2. **Le client seul ne peut pas déchiffrer.** `masterKey` exige `wrapSecret`, qui n'existe que côté serveur, libéré uniquement par `POST /me/pin/unlock` après présentation d'un `verifier` correct.
3. **Un vol du blob client est cryptographiquement insuffisant.** L'attaquant doit passer par un endpoint réseau soumis à verrou, une fois par PIN candidat.

Le compteur PBKDF2 est volontairement plus bas qu'en v2 (210 000 vs 600 000) : le plancher OWASP suppose que le KDF est la **seule** défense, hypothèse qui ne tient plus en v3 ; on garde donc juste « pas instantané » sans pénaliser les appareils mobiles à chaque déverrouillage.

### 2.4 Le verrou serveur anti-force-brute

[`src/services/pinSecurityService.ts`](../../../synco_api/src/services/pinSecurityService.ts)

| Tentatives échouées | Conséquence |
|---|---|
| 1 → 5 | Aucune (tolérance aux fautes de frappe) |
| 3 | 📧 Email d'alerte de sécurité envoyé (avant même le premier verrou) |
| 6 | Verrou 30 s |
| 7 | Verrou 2 min |
| 8 | Verrou 10 min |
| 9 | Verrou 1 h |
| 10 et + | Verrou 24 h (plafond, ne réescalade plus) |

Le compteur (`failedAttempts`, `lockedUntil`, `lastFailedAt`, `alertedAt`) vit dans `UserPinSecret`. `alertedAt` évite de spammer l'utilisateur à chaque échec.

Dans le pire cas atteignable, tester les 10 000 PIN à 24 h par tentative dépasse largement toute fenêtre d'attaque réaliste.

> Historique : l'audit `N6-pin-bruteforce-protection-inerte` du 14/09/2026 avait relevé que cette protection était présente mais inopérante. Elle a été corrigée depuis.

### 2.5 Réinitialisation du PIN — perte de données irréversible

`setupFirstTimeSecurityV3()` génère une **nouvelle paire RSA**. Réinitialiser son PIN ne « redéverrouille » donc pas l'ancien contenu : la nouvelle clé privée ne peut pas déchiffrer les `ThreadKey`, `WorkspaceKey`, `DMConversationKey` ou `AiSessionKey` scellées pour l'ancienne clé publique.

**Conséquence directe : un PIN oublié = perte définitive de tout l'historique chiffré de bout en bout**, tant qu'un autre membre ne redistribue pas les clés concernées vers la nouvelle clé publique. Il n'existe **aucun mécanisme de séquestre (key escrow), aucune clé de récupération d'organisation, aucun code de secours**. C'est une propriété de sécurité voulue, mais c'est aussi le principal risque opérationnel du produit — voir fiche [12](./12-perimetre-limites-modele-de-menace.md).

## 3. Trust-On-First-Use : ne pas croire le serveur sur parole

[`synco_app/src/assets/utils/keyTrust.ts`](../../src/assets/utils/keyTrust.ts)

Le maillon faible théorique de tout E2EE avec annuaire de clés centralisé : le serveur distribue les clés publiques, donc un serveur malveillant peut substituer la sienne et monter une attaque de l'intercepteur.

Synco répond par un **TOFU local** :

- la première clé publique jamais vue pour un `userId` donné est mise en cache dans **IndexedDB** (`idb-keyval`, préfixe `trusted-pubkey:`), par appareil ;
- toute clé ultérieure différente renvoie `'changed'` au lieu d'être acceptée silencieusement ;
- `computeKeyFingerprint()` produit une empreinte SHA-256 tronquée à 16 caractères hexadécimaux, destinée à la **comparaison hors bande** (de vive voix, par un autre canal) ;
- `trustKey()` permet de re-faire confiance explicitement, après confirmation humaine.

Dans `ChatView.vue`, un changement de clé **bloque l'envoi du message** et ouvre un panneau de vérification d'empreinte : l'utilisateur doit confirmer avant que quoi que ce soit ne parte.

> Cette mesure vient de la remédiation d'un constat d'audit (« le serveur ne doit pas être une source d'identité de clé faisant autorité »).

**Limite connue :** le cache est par appareil. Sur un nouvel appareil, toutes les clés sont « nouvelles » — première connexion = confiance implicite.

## 4. Chaîne de confiance complète

```
                       PIN (4 chiffres, v3)
                            │
                  PBKDF2 210k ─┴─→ unlockKey ──HMAC──→ verifier ──→ serveur
                            │                                         │
                            │              wrapSecret ←───────────────┘
                            │                   │            (libéré si verifier OK,
                            └───── HKDF ────────┘             sous verrou exponentiel)
                                    │
                                 masterKey (AES-GCM 256)
                                    │
                      déchiffre User.encryptedPrivateKey
                                    │
                         Clé privée RSA-4096 (non extractible, RAM seule)
                                    │
        ┌───────────────┬───────────┴────────┬───────────────┬──────────────┐
        ▼               ▼                    ▼               ▼              ▼
    ThreadKey     WorkspaceKey      DMConversationKey   AiSessionKey   clé LiveKit
    (salons)      (fichiers)        (fichiers DM)       (IA gateway)   (= ThreadKey)
        │               │                    │               │              │
        ▼               ▼                    ▼               ▼              ▼
    messages,       fichiers            fichiers DM     sessions IA    audio/vidéo
    index de       chiffrés                                              du salon
    recherche
```

Les messages privés (DM) sont le seul flux qui **n'utilise pas de clé intermédiaire persistante** pour son contenu : chaque message porte sa propre clé AES scellée directement par RSA. Voir fiche [04](./04-messages-prives-dm.md).

## 5. Ce que cette fondation ne protège pas

- **Un appareil compromis pendant une session déverrouillée.** La clé privée est en RAM et utilisable ; le PIN ne protège qu'au repos.
- **Le premier échange sur un appareil neuf** (pas de cache TOFU).
- **Les métadonnées.** Le serveur connaît qui parle à qui, quand, dans quel salon, avec combien de pièces jointes de quelle taille.
- **Le code du client lui-même.** Synco est une application web : le serveur sert le JavaScript qui manipule les clés. Un serveur malveillant peut servir un client modifié. C'est la limite structurelle de tout E2EE livré par le web, mitigée seulement par les binaires Tauri/Capacitor (desktop/mobile), où le code est empaqueté et signé.
