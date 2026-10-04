# 02 — Chiffrement côté base de données (chiffrement au repos)

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`src/lib/prisma.ts`](../../../synco_api/src/lib/prisma.ts), [`prisma/schema.prisma`](../../../synco_api/prisma/schema.prisma) |
| **Bibliothèque** | `prisma-field-encryption` (extension Prisma) |
| **Clé** | `PRISMA_FIELD_ENCRYPTION_KEY` (variable d'environnement de `synco_api`) |
| **Statut E2EE** | ❌ **Ce n'est PAS de l'E2EE** — le serveur détient la clé |

---

## 1. Principe

`synco_api` n'instancie jamais un client Prisma nu. Le client exporté est systématiquement enveloppé :

```ts
// src/lib/prisma.ts
export const prisma = globalClient.$extends(
  fieldEncryptionExtension()
)
```

Tout champ annoté `/// @encrypted` dans le schéma est **chiffré en AES-256-GCM avec un IV aléatoire au moment de l'écriture**, et déchiffré à la lecture, de façon transparente pour le code applicatif. La clé unique vit dans `PRISMA_FIELD_ENCRYPTION_KEY`.

### Ce que cette couche protège

| Menace | Protégé ? |
|---|---|
| Vol d'un dump SQL / d'une sauvegarde | ✅ Oui |
| Vol du disque du serveur de base | ✅ Oui |
| Accès direct à PostgreSQL (`psql`, réplica, outil d'admin) | ✅ Oui |
| Injection SQL qui exfiltrerait des lignes | ✅ Oui (contenu illisible) |
| Compromission **applicative** de `synco_api` | ❌ **Non** — le processus possède la clé |
| Administrateur système de Synco avec accès au `.env` | ❌ **Non** |
| Réquisition judiciaire adressée à Synco | ❌ **Non** pour cette couche |

C'est exactement pour ces trois dernières lignes que la couche E2EE existe par-dessus.

## 2. Superposition des couches

Un message de salon est, sur le disque du serveur de base :

```
AES-GCM( PRISMA_FIELD_ENCRYPTION_KEY,
    base64( AES-GCM( ThreadKey, "texte en clair" ) )
)
```

La couche base n'apporte **rien de plus** en confidentialité pour les contenus déjà E2EE (elle chiffre du chiffré), mais elle est appliquée uniformément et sans exception : le code n'a pas à savoir si un champ est déjà E2EE ou non.

Pour tout ce qui n'est **pas** E2EE (tâches, agenda, profils, notifications), c'est en revanche **la seule et unique protection**.

## 3. Inventaire exhaustif des champs chiffrés en base

> État au 2026-09-28. Tout modèle ajouté après cette date est absent de cette liste.

### Identité et sécurité

| Modèle | Champs chiffrés |
|---|---|
| `User` | `email`, `name`, `pseudo`, `avatarUrl`, `job`, `description`, `publicKey`, `encryptedPrivateKey`, `keyIv`, `pinSalt` |
| `UserPinSecret` | `verifier`, `wrapSecret` |

> Note sur `UserPinSecret` : le schéma documente explicitement que ce chiffrement est de la **défense en profondeur**, pas la vraie propriété de sécurité. Un accès applicatif compromis qui déchiffre déjà `User.encryptedPrivateKey` déchiffre aussi cette ligne. La vraie barrière v3, c'est le verrou côté serveur de `POST /me/pin/unlock`.

### Matériel de clés E2EE (enveloppes RSA)

| Modèle | Champ chiffré |
|---|---|
| `ThreadKey` | `encryptedKey` |
| `OrgKey` | `encryptedKey` |
| `WorkspaceKey` | `encryptedKey` |
| `DMConversationKey` | `encryptedKey` |
| `AiSessionKey` | `encryptedKey` |

Ces champs contiennent déjà du chiffré RSA-OAEP — la couche base est ici purement défensive.

### Organisation et structure

| Modèle | Champs chiffrés |
|---|---|
| `Organization` | `name`, `logo`, `aiApiKey` |
| `WorkSpace` | `name`, `logo` |
| `Category` | `name` |
| `Thread` | `name` |
| `Folder` | `name`, `color` |

### Contenus de messagerie

| Modèle | Champs chiffrés |
|---|---|
| `Message` | `content`, `nonce`, `iv` |
| `DMMessage` | `content`, `nonce`, `encryptedAesKey`, `selfEncryptedAesKey`, `voiceInviteThreadName` |

### Fichiers

| Modèle | Champs chiffrés |
|---|---|
| `StoredFile` | `originalName`, `hash`, `encryptedFileKey`, `iv` |

### Webhooks

| Modèle | Champs chiffrés |
|---|---|
| `Webhook` | `name`, `description`, `defaultThreadId`, `avatarUrl` |
| `WebhookMessage` | `content`, `nonce`, `senderName`, `senderAvatar`, `senderIp`, `userAgent` |
| `WebhookAuditLog` | `action`, `ipAddress`, `userAgent`, `userId` |

### Notifications

| Modèle | Champs chiffrés |
|---|---|
| `NotificationToken` | `token` (jetons FCM / APNS / Tauri) |
| `Notification` | `title`, `body` |

### Tâches et agenda

| Modèle | Champs chiffrés |
|---|---|
| `Task` | `title`, `description` |
| `TodoList` | `title`, `description` |
| `CalendarEvent` | `title`, `description`, `location` |

### IA et recherche

| Modèle | Champs chiffrés |
|---|---|
| `AiChatSession` | `title`, `messages` |
| `EncryptedSearchIndex` | `type`, `resourceId`, `encryptedBlob`, `iv` |

### Intégrations externes

| Modèle | Champs chiffrés |
|---|---|
| `ExternalCalendarConnection` | `externalAccountEmail`, `icsUrl` |

> `accessTokenEncrypted` / `refreshTokenEncrypted` de ce même modèle ne portent **pas** l'annotation `/// @encrypted` : ils sont chiffrés **en amont** par [`src/utils/googleCalendarCrypto.ts`](../../../synco_api/src/utils/googleCalendarCrypto.ts) avec une **clé maître dédiée** (`SYNCO_GOOGLE_OAUTH_MASTER_KEY`), volontairement distincte de celle des webhooks — un refresh token Google donne accès à un compte tiers, on ne veut pas qu'une compromission de clé entraîne l'autre.

## 4. Champs volontairement **non** chiffrés — et pourquoi

Le schéma documente ses propres exceptions. Ce sont des choix, pas des oublis.

| Champ | Raison |
|---|---|
| `User.bannedAt`, `bannedReason`, `bannedById` | Métadonnées d'administration, à filtrer/trier côté base — pas du contenu utilisateur |
| `ExternalCalendarConnection.externalCalendarId` | Sous contrainte d'unicité et utilisé dans un `upsert` par égalité. AES-GCM à IV aléatoire n'est pas déterministe, donc inutilisable dans un `where`. Simple identifiant technique (`"primary"`, `sha256(url)`, ou un cuid). |
| `Tag.name`, `Tag.color` | `@@unique([organizationId, name])` — même contrainte technique |
| `Message.senderId`, `threadId`, `createdAt`, `replyToId`, `transferId` | Métadonnées relationnelles, indispensables aux index et aux jointures |
| `MessageReaction.emoji`, `DMMessageReaction.emoji` | **Non chiffrés du tout** — l'emoji est lisible tel quel en base |
| `StoredFile.mimeType`, `size`, `encoding`, `forceDownload` | Nécessaires au service HTTP sans déchiffrement |
| `CalendarEvent.startAt`, `endAt`, `allDay`, `timezone`, `color`, `recurrenceRule` | Indispensables aux requêtes de plage de dates et à l'expansion des séries récurrentes |
| `Task.status`, `dueDate`, `archived`, `spaceId`, assignations | Nécessaires aux filtres Kanban et aux index |
| `EventAttendee.status` | Requêtable |
| `Notification.data`, `metadata` (`Json`) | `prisma-field-encryption` ne chiffre que les champs `String`, pas `Json` |
| `AiChatSession.pendingToolCall` (`Json`) | Même limitation |
| `AgendaFeedToken.token` | Sous contrainte `@unique`, recherché par égalité |
| `Webhook.token`, secrets de signature | Gérés par leur propre chiffrement ECDH ([`src/utils/webhookCrypto.ts`](../../../synco_api/src/utils/webhookCrypto.ts)) |

### Limitation structurelle à connaître

**`prisma-field-encryption` ne chiffre que les champs `String`.** Tout ce qui est stocké en `Json` (`Notification.data`, `Notification.metadata`, `Task`/`Message.embeds`, `Organization.features`, `User.data`, `pendingToolCall`) est **en clair en base**. C'est explicitement documenté dans le schéma pour `AiChatSession.messages`, qui est pour cette raison stocké en `String` JSON-sérialisé plutôt qu'en `Json` natif.

➡️ **Toute nouvelle colonne `Json` portant du contenu utilisateur sensible échappe à la couche de chiffrement au repos.** À vérifier systématiquement lors de l'ajout d'un modèle.

## 5. Fichiers sur disque

Il n'y a plus de chiffrement des fichiers côté serveur : **tout fichier est
chiffré de bout en bout par le client** avant l'envoi, et le serveur ne
stocke que ce chiffré (fiche [05](./05-fichiers-et-stockage.md)). Aucune clé
serveur ne permet de lire le contenu d'un fichier.

## 6. Gestion des clés serveur

| Variable | Rôle | Comportement si absente/invalide |
|---|---|---|
| `PRISMA_FIELD_ENCRYPTION_KEY` | Chiffrement de champ en base | Erreur de l'extension |
| `CDN_TICKET_PRIVATE_KEY` | Signature Ed25519 des tickets de transfert synco_cdn | **Refus de démarrage** |
| `CDN_INTERNAL_SECRET` | HMAC des appels internes API ↔ synco_cdn | **Refus de démarrage** si < 32 octets |
| `SYNCO_WEBHOOK_MASTER_KEY` | Chiffrement des clés privées de webhook | **Refus de démarrage** si ≠ 32 octets décodés |
| `SYNCO_GOOGLE_OAUTH_MASTER_KEY` | Chiffrement des jetons OAuth agenda | **Refus de démarrage** si < 32 octets |

Le principe « échouer au démarrage plutôt que dégrader silencieusement » est appliqué partout ; il a été généralisé à la suite de l'audit `L2-cle-maitre-webhook-warn-au-lieu-fail` (11/09/2026), qui avait relevé la dernière exception.

### ⚠️ Pas de rotation de clé serveur implémentée

Aucun mécanisme de rotation ni de versionnement des clés maîtres serveur n'existe dans le code. Changer `PRISMA_FIELD_ENCRYPTION_KEY` rendrait illisibles toutes les données existantes. `prisma-field-encryption` supporte nativement une clé de déchiffrement héritée (`PRISMA_FIELD_DECRYPTION_KEYS`) — elle n'est pas utilisée ici.

> ⚠️ Point historique important, relevé par l'audit du 10/09/2026 : un nettoyage d'historique Git ne protège que les clones **futurs**. Si le dépôt a été cloné, forké ou consulté avant ce nettoyage, les secrets qui figuraient dans l'historique (mot de passe base, `PRISMA_FIELD_ENCRYPTION_KEY`, `SYNCO_WEBHOOK_MASTER_KEY`, clés LiveKit) doivent être considérés comme potentiellement compromis. Voir [`audits/fix_audit_pentest_full_2026-09-10.md`](../../../synco_api/audits/fix_audit_pentest_full_2026-09-10.md).
