# 03 — Messages de salons (Threads)

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/views/OrgSpace/views/ThreadView.vue`](../../src/views/OrgSpace/views/ThreadView.vue), [`synco_app/src/views/OrgSpace/components/popup/CreateNewThread.vue`](../../src/views/OrgSpace/components/popup/CreateNewThread.vue), [`src/websocket/routes/thread.ts`](../../../synco_api/src/websocket/routes/thread.ts) |
| **Modèles Prisma** | `Thread`, `ThreadKey`, `Message`, `MessageReaction`, `ThreadInvite` |
| **Statut** | ✅ **E2EE** sur le corps des messages — ❌ métadonnées et réactions en clair |

---

## 1. Le modèle de clé : une `ThreadKey` par salon

Un **Thread** (salon textuel ou vocal) possède **une clé AES-256-GCM unique**, la `ThreadKey`, générée dans le navigateur du créateur au moment de la création du salon :

```ts
// CreateNewThread.vue
const newThreadKey = await generateThreadKey();          // AES-GCM 256, extractable
for (const member of members) {
    const encryptedKey = await encryptThreadKeyForMember(newThreadKey, member.publicKey);
    // → RSA-OAEP-SHA256 avec la clé publique du membre
}
// POST { keys: encryptedKeysPayload }
```

Chaque membre reçoit **sa propre copie de la même clé AES**, scellée avec sa clé publique RSA. Le serveur ne stocke que ces enveloppes (`ThreadKey.encryptedKey`, elle-même re-chiffrée par la couche base). **La clé AES en clair n'existe jamais côté serveur.**

Un membre sans `publicKey` (compte n'ayant jamais déverrouillé son E2EE) est simplement ignoré à la distribution.

## 2. Récupération de la clé à l'ouverture d'un salon

Via WebSocket, `get-thread-access` :

```
client ──"get-thread-access" {threadId}──▶ synco_api
                                              │ vérifie la permission d'espace (getPermission)
                                              │ cherche ThreadKey(threadId, userId)
        ◀──{ encryptedKey }───────────────────┘
client : decryptThreadKeyWithRsa(encryptedKey, maClePrivee) → CryptoKey AES-GCM
```

Trois issues possibles :

| Cas | Réponse |
|---|---|
| Clé trouvée | `{ encryptedKey }` |
| Membre du salon mais sans clé (après réinitialisation d'E2EE) | `{ error, needsReadd: true }` → « Un administrateur doit vous réajouter » |
| Non membre | `{ error }` générique |

Tant que `currentThreadKey` est `null`, **la zone de saisie est désactivée** (`:disabled="!currentThreadKey"`). Il n'existe **aucun repli en clair** : impossible d'envoyer un message non chiffré dans un salon.

## 3. Redistribution de clé à un nouveau membre

Deux événements WebSocket coopèrent :

1. **`request-thread-keys`** — le nouveau membre diffuse sa demande et sa clé publique à la salle (`space:<id>` ou `org:<id>`).
2. **`distribute-thread-keys`** — un membre déjà en possession de la clé la rescelle pour le demandeur et l'envoie.

Le serveur vérifie **trois conditions** avant d'accepter l'écriture (durcissement issu de l'audit `C7-bola-ecrasement-cles-e2ee-thread`) :

- le distributeur est bien membre (ou propriétaire) du salon ;
- le distributeur possède **lui-même** une `ThreadKey` pour ce salon (preuve d'un accès E2EE légitime) ;
- la cible est elle aussi membre du salon.

Le serveur ne peut donc pas fabriquer de clé, et un membre extérieur ne peut pas écraser celle d'un autre.

> ⚠️ **La distribution dépend d'un pair en ligne.** Si personne ne possédant la clé n'est connecté, le nouveau membre reste bloqué sur « clé introuvable » jusqu'à ce qu'un membre ouvre le salon.

## 4. Envoi d'un message

```ts
const { ciphertext, iv } = await encryptMessageWithContentKey(newMessage.value, currentThreadKey.value);
socket.emit("send-message", {
    threadId, content: ciphertext, iv,
    nonce: "n_" + Date.now(),
    replyToId, context, references
});
```

- `content` : `base64( AES-GCM(ThreadKey, texte) )` — inclut le tag d'authentification 128 bits.
- `iv` : IV 96 bits aléatoire, en base64. **C'est le vrai vecteur d'initialisation.**
- `nonce` : ⚠️ **champ résiduel non cryptographique** pour les messages de salon — il ne contient qu'un horodatage (`"n_1727..."`). Il conserve un rôle cryptographique réel uniquement pour les DM (voir fiche [04](./04-messages-prives-dm.md)). Source de confusion à l'audit ; sans impact sur la sécurité, l'IV réel étant bien en `iv`.

## 5. Réception et déchiffrement

À la réception, le client déchiffre chaque message avec `decryptMessageWithContentKey(content, iv, threadKey)`.

En cas d'échec (clé absente, IV manquant, message d'une ancienne génération de clé), **l'erreur est absorbée** et le message s'affiche comme :

```
[⚠️ Impossible de déchiffrer ce message.]
```

C'est un choix délibéré : un seul message illisible ne doit pas casser l'affichage du fil entier.

Le déchiffrement se fait **par lots de 10** (`BATCH_SIZE`) pour ne pas bloquer le thread principal sur un long historique.

## 6. Édition de message

L'édition suit exactement le même chemin : le nouveau contenu est rechiffré côté client avec la `ThreadKey` avant émission. Le serveur ne voit jamais le texte modifié.

## 7. Ce qui **n'est pas** E2EE dans un salon

| Donnée | Visible par le serveur ? | Chiffré en base ? |
|---|---|---|
| Corps du message | ❌ Non | ✅ (double couche) |
| `senderId` (auteur) | ✅ **Oui** | ❌ Non |
| `threadId` (salon) | ✅ **Oui** | ❌ Non |
| `createdAt` / `updatedAt` | ✅ **Oui** | ❌ Non |
| `replyToId`, `transferId` (fil de réponses) | ✅ **Oui** | ❌ Non |
| `edited` (a été modifié) | ✅ **Oui** | ❌ Non |
| Longueur approximative du message | ✅ **Oui** (taille du ciphertext) | — |
| **Réactions emoji** | ✅ **Oui, en clair** | ❌ **Non chiffré** |
| Nom du salon | ❌ Non lisible en base | ✅ `Thread.name` chiffré |
| Nom de la catégorie / de l'espace | ❌ Non lisible en base | ✅ chiffrés |
| Liste des membres (`membersId`, `writersId`) | ✅ **Oui** | ❌ Non |
| `isPrivate`, `isReadOnly`, `type` | ✅ **Oui** | ❌ Non |
| Références `<@:id>` extraites du message | ✅ **Oui** (`MessageReference`) | partiellement |

### Le cas des réactions

`MessageReaction.emoji` est stocké **en clair, sans annotation `/// @encrypted`**. Le serveur sait donc que l'utilisateur X a réagi « 👍 » au message Y à l'instant Z. C'est une fuite de signal social non négligeable (approbation, désaccord) sur un contenu par ailleurs E2EE.

### Le cas des références

Quand un message contient `<@:userId>` ou `<#:threadId>`, ces jetons sont **extraits côté client et envoyés en clair** au serveur (`extractReferenceTokens`) pour alimenter le modèle `MessageReference` (mentions, liens entre ressources). Le serveur apprend donc **qui est mentionné dans quel message**, même sans en lire le texte.

## 8. Messages postés par webhook

`Message.isWebhook = true` avec `webhookId`, `webhookName`, `webhookAvatar` et `embeds` (`Json`, donc **en clair en base**). Un message de webhook ne suit pas le chemin E2EE client — voir fiche [11](./11-webhooks-notifications-presence.md).

## 9. Invitations de salon (`ThreadInvite`)

| Champ | Nature |
|---|---|
| `code` | Code d'invitation unique, **en clair** |
| `expiresAt` | Fenêtre de validité (obligatoire) |
| `maxUses` / `uses` | Compteur d'usage, `null` = illimité dans la fenêtre |

> L'audit `L7-liens-invitation-100-ans` (11/09/2026) avait relevé des liens à durée de vie quasi infinie. Corrigé depuis.

⚠️ **Un invité rejoignant par lien n'a pas de `ThreadKey`.** Il ne peut donc ni lire l'historique chiffré ni participer à un appel vocal E2EE de ce salon — voir fiche [07](./07-salons-vocaux-livekit.md).

## 10. Absence de rotation de clé

**Il n'existe aucune rotation de `ThreadKey`** dans le code à cette date :

- quand un membre quitte ou est exclu d'un salon, la `ThreadKey` **n'est pas régénérée** ;
- sa copie de la clé n'est pas systématiquement supprimée (`ws.ts` documente explicitement que « la copie d'un membre exclu n'est pas garantie nettoyée », cf. audit `L4-rooms-websocket-basees-sur-orgkey`) ;
- un ancien membre ayant conservé une copie locale de la clé AES **peut déchiffrer tout message futur** du salon s'il parvient à en récupérer le ciphertext.

Conséquence concrète : **l'exclusion d'un salon est une révocation d'accès applicative, pas une révocation cryptographique.** Voir fiche [12](./12-perimetre-limites-modele-de-menace.md).

Le modèle `ThreadKey` n'a d'ailleurs **pas de champ `version`**, contrairement à `WorkspaceKey`, `OrgKey`, `DMConversationKey` et `AiSessionKey` — la rotation n'a donc même pas de support de schéma ici.
