# 04 — Messages privés (DM)

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/views/OrgSpace/views/ChatView.vue`](../../src/views/OrgSpace/views/ChatView.vue), [`synco_app/src/assets/utils/dmCrypto.ts`](../../src/assets/utils/dmCrypto.ts), [`src/routes/dmKeys.ts`](../../../synco_api/src/routes/dmKeys.ts), [`src/websocket/routes/dm.ts`](../../../synco_api/src/websocket/routes/dm.ts) |
| **Modèles Prisma** | `DMMessage`, `DMConversationKey`, `DMMessageReaction` |
| **Statut** | ✅ **E2EE** sur le corps des messages et les pièces jointes |

---

## 1. Deux mécanismes distincts dans le même module

Les messages privés utilisent **deux systèmes de clés différents**, ce qui est contre-intuitif mais délibéré :

| Contenu | Mécanisme | Clé |
|---|---|---|
| **Corps du message** | Enveloppe hybride **par message** | Clé AES jetable, scellée RSA à chaque envoi |
| **Pièces jointes** | Clé de conversation **persistante** | `DMConversationKey` (AES-256, versionnée) |

Le premier donne une granularité maximale (chaque message a sa propre clé) ; le second évite de re-négocier une clé de chiffrement de fichier à chaque envoi.

## 2. Corps du message — enveloppe hybride par message

`encryptForPeer()` ([`crypto.ts`](../../src/assets/utils/crypto.ts)) :

```
1. messageKey = AES-GCM 256 générée aléatoirement, pour ce message uniquement
2. ciphertext = AES-GCM(messageKey, iv, texte)
3. encryptedAesKey     = RSA-OAEP(clePubliqueDestinataire, messageKey)
4. selfEncryptedAesKey = RSA-OAEP(clePubliqueExpediteur,   messageKey)
```

Le **double scellement** est essentiel : sans `selfEncryptedAesKey`, l'expéditeur serait incapable de relire ses propres messages envoyés (il ne possède pas la clé privée du destinataire).

À la lecture, le client choisit la bonne enveloppe :

```ts
const keyToUse = (msg.senderId === user.value?.id)
    ? msg.selfEncryptedAesKey     // je suis l'expéditeur
    : msg.encryptedAesKey;        // je suis le destinataire
```

### Correspondance des champs en base

| Champ `DMMessage` | Contenu réel |
|---|---|
| `content` | ciphertext AES-GCM, base64 |
| `nonce` | ⚠️ **l'IV AES-GCM** (contrairement aux messages de salon, où l'IV est dans `iv`) |
| `encryptedAesKey` | clé AES scellée pour le destinataire |
| `selfEncryptedAesKey` | clé AES scellée pour l'expéditeur |
| `isE2EE` | drapeau booléen |

> Incohérence de nommage entre `Message` (IV dans `iv`, `nonce` inutilisé) et `DMMessage` (IV dans `nonce`, pas de champ `iv`). Sans impact sur la sécurité, mais piège lors de toute reprise du code.

## 3. ⚠️ Le drapeau `isE2EE` et le repli en clair

Contrairement aux salons, où l'envoi est **bloqué** sans clé, les DM portent un booléen `isE2EE` et le client applique :

```ts
if (!msg.isE2EE || !keyToUse || !msg.nonce) {
    return { ...msg, content: msg.content };   // affiché tel quel, en clair
}
```

Un `DMMessage` avec `isE2EE = false` transporte donc du **texte en clair**, protégé uniquement par la couche de chiffrement en base.

Dans le chemin nominal actuel, `useEncryption` est vrai dès que la clé publique du destinataire et la clé privée locale sont disponibles, et un échec de chiffrement **annule l'envoi** (`toast "Erreur lors du chiffrement"`, message retiré) plutôt que d'envoyer en clair. Le repli concerne donc essentiellement les **messages historiques** antérieurs à l'E2EE et les correspondants n'ayant jamais initialisé leur paire de clés.

➡️ Le code n'affiche **aucun indicateur visuel** distinguant un DM E2EE d'un DM en clair dans le fil. C'est une amélioration à considérer.

## 4. Vérification de la clé du correspondant (TOFU)

Avant chaque envoi, `ChatView.vue` compare la clé publique du destinataire à celle mise en cache localement (`checkKeyTrust`, cf. fiche [01](./01-fondations-cryptographiques.md) §3).

Si la clé a changé :

1. l'envoi est **interrompu** ;
2. le texte est restitué dans la zone de saisie (rien n'est perdu) ;
3. l'empreinte SHA-256 tronquée est affichée dans un panneau dédié ;
4. l'utilisateur doit confirmer explicitement avant tout nouvel envoi.

C'est la défense anti-interception la plus visible du produit.

## 5. Pièces jointes — `DMConversationKey`

[`dmCrypto.ts`](../../src/assets/utils/dmCrypto.ts) reprend la logique de `getWorkspaceKey()` en la réduisant à deux participants.

```
GET /api/dm/:peerId/key
  ├─ 200 → { encryptedKey, version } → RSA-OAEP → CryptoKey AES-GCM (mise en cache)
  └─ 404 → aucune clé encore : le client en génère une (v1),
           la scelle pour lui-même ET pour le correspondant,
           puis POST /api/dm/:peerId/key { encryptedKeyForMe, encryptedKeyForPeer }
```

Particularités :

- **Pas d'entité « conversation » en base.** La paire `(userOneId, userTwoId)` est triée lexicographiquement (`sortedPair`) pour que la recherche soit symétrique quel que soit l'initiateur.
- Deux lignes `DMConversationKey` sont créées d'un coup, une par `ownerId`, via `createMany({ skipDuplicates: true })` — la course entre les deux participants est ainsi inoffensive.
- **Pas d'étape « l'admin distribue à tout le monde »** : le premier arrivé (expéditeur ou destinataire) peut créer la version 1.
- Le serveur vérifie `sharesOrgWith(userId, peerId)` sur les deux routes — on ne peut pas créer une clé de conversation avec un utilisateur avec qui on ne partage aucune organisation (durcissement issu de l'audit `M11-dm-appels-sans-relation`).

Le fichier lui-même est chiffré côté client par `encryptFileLocal(buffer, DMConversationKey)` — même mécanisme que les fichiers d'espace, voir fiche [05](./05-fichiers-et-stockage.md).

> Le fichier est **uploadé avant** que le `DMMessage` n'existe : `uploadFile` reçoit `dmPeerId` pour pouvoir chiffrer sans connaître encore l'id du message, qui est rattaché après coup par `edit-dm-message-files`.

## 6. Messages riches : invitation à un salon vocal

`DMMessage.type = 'voice_invite'` porte un instantané dénormalisé au moment de l'envoi :

| Champ | Chiffré en base ? | E2EE ? |
|---|---|---|
| `voiceInviteThreadName` | ✅ Oui | ❌ Non |
| `voiceInviteThreadId` | ❌ Non | ❌ Non |
| `voiceInviteOrgId` | ❌ Non | ❌ Non |
| `voiceInviteSpaceId` | ❌ Non | ❌ Non |

Une invitation vocale est donc **entièrement lisible par le serveur** (il sait qui invite qui dans quel salon), le nom du salon étant seulement protégé par la couche base.

## 7. Ce qui **n'est pas** E2EE dans un DM

| Donnée | Visible par le serveur ? | Chiffré en base ? |
|---|---|---|
| Corps du message (si `isE2EE`) | ❌ Non | ✅ |
| `senderId` / `recipientId` | ✅ **Oui** — le graphe social complet | ❌ Non |
| `createdAt` | ✅ **Oui** | ❌ Non |
| `replyToId` | ✅ **Oui** | ❌ Non |
| `edited` | ✅ **Oui** | ❌ Non |
| **Réactions emoji** (`DMMessageReaction`) | ✅ **Oui, en clair** | ❌ **Non** |
| Type de message (`text` / `voice_invite`) | ✅ **Oui** | ❌ Non |
| Cible d'une invitation vocale | ✅ **Oui** | partiellement |
| Nom des fichiers joints | ❌ Non lisible | ✅ `StoredFile.originalName` |
| Taille / type MIME des fichiers | ✅ **Oui** | ❌ Non |
| Références/mentions extraites | ✅ **Oui** | partiellement |

## 8. Absence de rotation

`DMConversationKey` possède un champ `version` et une contrainte `@@unique([userOneId, userTwoId, ownerId, version])`, mais **aucun code ne produit jamais de version > 1**. Il n'existe pas de route de rotation, ni de déclencheur de rotation.

Conséquence : une clé de conversation DM, une fois établie, est **permanente**. Si elle fuite un jour, tout l'historique **et tout l'avenir** des pièces jointes de cette conversation sont compromis. Pas de confidentialité persistante (*forward secrecy*) — voir fiche [12](./12-perimetre-limites-modele-de-menace.md).

Les corps de messages, eux, bénéficient d'une clé jetable par message : la compromission d'une clé de message n'expose que ce message. En revanche, la compromission de la **clé privée RSA** de l'utilisateur ouvre rétroactivement tout son historique.
