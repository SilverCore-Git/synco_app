# 11 — Webhooks, notifications et présence

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`src/utils/webhookCrypto.ts`](../../../synco_api/src/utils/webhookCrypto.ts), [`src/utils/webhookSecurity.ts`](../../../synco_api/src/utils/webhookSecurity.ts), [`src/middleware/webhookValidation.ts`](../../../synco_api/src/middleware/webhookValidation.ts), [`src/services/notificationService.ts`](../../../synco_api/src/services/notificationService.ts), [`src/services/apnsService.ts`](../../../synco_api/src/services/apnsService.ts), [`src/services/presence.ts`](../../../synco_api/src/services/presence.ts) |
| **Modèles Prisma** | `Webhook`, `WebhookMessage`, `WebhookAuditLog`, `Notification`, `NotificationToken` |
| **Statut** | ❌ **Pas d'E2EE au sens Synco** — chiffrement serveur et intégrité de transport |

---

## 1. Webhooks : une frontière naturelle de l'E2EE

Un webhook permet à un **outil extérieur** (CI, supervision, CRM…) de poster dans un salon Synco. Cet outil ne possède **par définition pas** de clé privée RSA Synco, ni de `ThreadKey`.

➡️ **Un message posté par webhook ne peut pas être E2EE dans le modèle Synco.** Le chiffrement mis en place ici est un chiffrement **de transport entre l'outil externe et `synco_api`**, décrit dans le schéma comme « E2EE » dans les commentaires, ce qui est une inexactitude de vocabulaire à corriger : le serveur déchiffre le contenu (`WebhookMessage.content` est annoté « Contenu déchiffré »).

## 2. Intégrité : signature HMAC

| Élément | Valeur |
|---|---|
| Algorithme | HMAC-SHA256 |
| Format d'en-tête | `X-Synco-Signature: t=<timestamp>,v1=<hex>` |
| Données signées | `timestamp ‖ body` (corps **brut**, via `extractRawBody()`) |
| Comparaison | `crypto.timingSafeEqual` après égalisation de longueur |
| Anti-rejeu | `validateTimestamp()` — fenêtre de **5 minutes** |
| Obligatoire ? | `requireSignature` — `false` par défaut en base (compatibilité), **`true` pour tout nouveau webhook** (audit `P17`) |

### Un bug instructif, corrigé et documenté

```
La comparer à la sortie de `createSignature()` (qui préfixe `t=…,v1=`)
confrontait 64 octets à 95 : `timingSafeEqual` lève alors, l'exception
était avalée, et TOUTE signature valide était rejetée.
```

Le contrôle de longueur est fait **avant** `timingSafeEqual`, avec la justification correcte : « la longueur du condensé n'étant pas un secret ».

`parseSignature()` valide strictement le format par expression régulière (`^t=(\d+),v1=([a-f0-9]+)$`) — pas de parsing permissif.

## 3. Chiffrement du contenu du webhook

### Schéma actuel : ECDH P-256

```
generateECDHKeyPair()  → courbe prime256v1 (P-256)
                         clé publique : SPKI/PEM
                         clé privée   : DER base64
deriveWebhookAESKeyFromECDH() → secret partagé → HKDF → AES-256-GCM
```

La clé privée du webhook est elle-même chiffrée au repos par `encryptPrivateKey()` avec `SYNCO_WEBHOOK_MASTER_KEY` (AES-256-GCM).

### ⚠️ Schéma legacy déprécié

```ts
/**
 * @deprecated Générait une clé symétrique présentée comme une paire
 * asymétrique — publicKey === privateKey (cf. audit H4). Conservée
 * uniquement pour déchiffrer les webhooks créés avant la migration ECDH.
 */
export async function generateLegacySymmetricKey()
```

L'audit `H4-webhook-cle-publique-egale-privee` (11/09/2026) a relevé que la « clé publique » distribuée aux intégrations **était identique à la clé privée**. Toute intégration créée avant la migration ECDH connaissait donc la clé privée du webhook.

➡️ **Action opérationnelle : les webhooks créés avant cette migration doivent être régénérés**, pas seulement conservés pour compatibilité de lecture.

### Clé maître obligatoire

`SYNCO_WEBHOOK_MASTER_KEY` doit décoder à **exactement 32 octets**. Le code refuse de démarrer sinon — avec une justification précise :

> « Contrôler le nombre de CARACTÈRES base64 ne suffit pas : une clé de 48 octets passe le seuil de 44 caractères, puis fait lever `createCipheriv` au premier webhook E2EE créé — une erreur 500 à l'exécution là où le démarrage aurait dû refuser. »

C'est la correction de l'audit `L2-cle-maitre-webhook-warn-au-lieu-fail`.

## 4. Inventaire des données de webhook

| Champ | Chiffré en base ? | Visible par le serveur ? |
|---|---|---|
| `Webhook.name`, `description`, `defaultThreadId`, `avatarUrl` | ✅ | ✅ (déchiffrable) |
| `Webhook.token` | ❌ **Non** (sous `@unique`) | ✅ |
| `Webhook.secret` (HMAC) | ❌ **Non** | ✅ |
| `Webhook.privateKey`, `keyIv` | chiffrés par `webhookCrypto` | ✅ |
| `WebhookMessage.rawPayload` (`Json`) | ❌ **Non — en clair** | ✅ **Oui** |
| `WebhookMessage.content`, `nonce` | ✅ | ✅ |
| `WebhookMessage.senderName`, `senderAvatar`, `senderIp`, `userAgent` | ✅ | ✅ |
| `WebhookAuditLog.action`, `ipAddress`, `userAgent`, `userId` | ✅ | ✅ |

⚠️ **`rawPayload` est un champ `Json`, donc non couvert par `prisma-field-encryption`.** Le payload brut envoyé par l'intégration — qui contient le contenu du message — est **stocké en clair en base**, même quand `content` est chiffré. C'est la fuite la plus notable de ce module.

> Durcissements associés : `H3-fuite-tokens-cles-webhooks` (les jetons et clés ne sont plus renvoyés dans les réponses d'API), `M7-journal-audit-webhook-non-borne`, `C3-bola-webhook-thread-cible-arbitraire`, `P11-test-webhook-sans-permission`, `P13-rate-limit-webhook-contournable`.

## 5. Messages postés par webhook dans un salon

`Message.isWebhook = true`, avec `webhookName`, `webhookAvatar`, `webhookCreatorId` et `embeds` (`Json`, **en clair**).

⚠️ Conséquence importante pour la cohérence du modèle : **un salon E2EE qui reçoit des messages de webhook contient des messages que le serveur peut lire**, mêlés à des messages que le serveur ne peut pas lire. Rien dans l'interface ne les distingue de ce point de vue. **Activer un webhook sur un salon dégrade la propriété E2EE de ce salon** pour les messages concernés.

## 6. Notifications push — la bonne décision

```ts
// 2. Sécuriser le contenu pour les messages
//    (Ne pas envoyer le contenu en clair à Apple/Google)
if (isMessage) {
    pushTitle = metadata.senderName ? `Nouveau message de ${metadata.senderName}` : 'Nouveau message';
    pushBody  = metadata.spaceName  ? `Nouveau message dans ${metadata.spaceName}`  : 'Message privé';
}
```

**Le contenu d'un message n'est jamais transmis à FCM ou APNS.** Seuls partent :

| Donnée envoyée à Apple/Google | Valeur |
|---|---|
| Titre | « Nouveau message de \<expéditeur\> » |
| Corps | « Nouveau message dans \<espace\> » ou « Message privé » |
| Image | `metadata.senderAvatar`, ou un avatar d'initiales généré par `ui-avatars.com` |

C'est cohérent avec l'E2EE : le serveur, même s'il le voulait, **ne pourrait pas** envoyer le contenu d'un message de salon (il ne l'a jamais en clair).

### ⚠️ Deux fuites résiduelles vers des tiers

1. **Le nom de l'expéditeur et le nom de l'espace partent en clair** chez Apple/Google. Techniquement inévitable pour une notification utile, mais c'est une fuite de graphe social vers un tiers.
2. **L'avatar de repli est appelé sur `ui-avatars.com`**, un service tiers, avec **le nom de l'utilisateur dans l'URL**. Ce service reçoit donc les noms des expéditeurs Synco, et voit l'adresse IP des serveurs Apple/Google qui vont chercher l'image. Pour une plateforme se présentant comme souveraine, c'est un point à réexaminer — un générateur d'initiales local ou une image `data:` supprimerait cette dépendance.

### Jetons de notification

`NotificationToken.token` (FCM / APNS / Tauri) porte `/// @encrypted` — correctement identifié comme un secret, puisqu'un jeton volé permet d'envoyer des notifications arbitraires à l'appareil.

### `Notification` en base

`title` et `body` sont chiffrés au repos, **pas E2EE**. Ils peuvent contenir un extrait de contenu pour certains types. Les champs `data` et `metadata` sont des `Json` — **en clair en base**.

> Durcissement : `N3-injection-notifications-cross-tenant` (14/09/2026) — impossible d'injecter une notification dans une organisation tierce.

## 7. Présence et WebSocket

| Aspect | Détail |
|---|---|
| Authentification | JWT Keycloak à la connexion |
| **Revalidation** | ✅ **Périodique** — corrige l'audit `H6-session-websocket-jamais-revalidee` : une révocation (exclusion d'organisation, compte désactivé, rotation JWKS) doit prendre effet sans attendre la déconnexion |
| Bannissement | `banMiddleware` refuse toute requête API **et WebSocket** d'un compte banni |
| Salles | `space:<id>` / `org:<id>` |
| Limitation de débit | Par utilisateur, plus par socket (audit `M8-rate-limit-websocket-par-socket`) |
| Audience JWT | Vérifiée (audit `M4-jwt-audience-non-verifiee`) |

⚠️ **Les salles WebSocket historiques étaient basées sur l'`OrgKey`**, et le code documente que « la copie d'un membre exclu n'est pas garantie nettoyée » (audit `L4-rooms-websocket-basees-sur-orgkey`). L'appartenance à une salle ne doit donc jamais être considérée comme une preuve cryptographique d'autorisation — elle est reverifiée à chaque opération sensible.

La présence (statut en ligne/absent/occupé) n'est **ni chiffrée ni E2EE** : c'est de la donnée temps réel, diffusée à toute l'organisation.

`reconcileStaleStatuses` nettoie les statuts obsolètes via `findMany` + `$transaction` d'`update`s — conformément à la règle du projet interdisant `$executeRaw`/`$queryRaw`.

## 8. Fuites de matériel E2EE corrigées

Deux audits ont porté spécifiquement sur des routes qui exposaient du matériel cryptographique à des tiers :

| Audit | Problème |
|---|---|
| `C5-fuite-materiel-cryptographique-e2ee` (11/09) | `encryptedPrivateKey`, `keyIv`, `pinSalt` renvoyés dans des réponses d'API générales |
| `P1-fuite-e2ee-membres-role-cross-org` (20/09) | Matériel E2EE de membres exposé à travers les organisations |
| `P2-fuite-e2ee-broadcast-websocket-member-new` (20/09) | Diffusion WebSocket `member:new` incluant le matériel E2EE |

Un utilitaire central, [`src/utils/userSelect.ts`](../../../synco_api/src/utils/userSelect.ts), définit désormais les projections de champs `User` autorisées, pour éviter que ces fuites ne réapparaissent à chaque nouvelle route. ✅ **Bon réflexe architectural** : la protection est structurelle, pas ponctuelle.

Une suite de tests de non-régression existe : [`src/security/pentest-2026-09-20.static.test.ts`](../../../synco_api/src/security/pentest-2026-09-20.static.test.ts).
