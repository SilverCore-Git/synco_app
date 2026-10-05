# 07 — Salons vocaux de Thread (LiveKit)

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/composables/useLiveKit.ts`](../../src/composables/useLiveKit.ts), [`src/routes/LiveKit.ts`](../../../synco_api/src/routes/LiveKit.ts) |
| **Infrastructure** | Serveur LiveKit (SFU) auto-hébergé |
| **Statut** | ✅ **E2EE** (activé et vérifié) quand le salon possède une `ThreadKey` — ⚠️ sinon non chiffré, après confirmation explicite et avec badge |

---

## 1. Pourquoi un SFU et pas du P2P ?

Un appel de groupe en pair-à-pair pur exige N×(N−1) connexions : impraticable au-delà de 3-4 participants. Synco utilise donc un **SFU** (Selective Forwarding Unit) LiveKit : chaque participant publie un flux vers le serveur, qui le redistribue.

Ce serveur est donc, par construction, **sur le chemin du média** — d'où la nécessité d'un E2EE applicatif par-dessus.

## 2. La clé E2EE = la `ThreadKey` du salon

C'est l'élégance de la conception : **aucun nouveau secret n'est introduit**. La clé de chiffrement média du salon vocal est **exactement la même clé AES-256** qui chiffre déjà les messages texte de ce Thread.

```
GET /api/livekit/token?threadId=…
   │  vérifie requireThreadAccess(userId, threadId)      ← audit P4
   │  génère un AccessToken LiveKit (identité, TTL 2h, canPublish conditionnel)
   │  lit ThreadKey(threadId, userId)
   ▼
{ url, token, e2eeKey: threadKey?.encryptedKey ?? null }
```

La réponse porte aussi `e2eeRequired: true` dès qu'au moins un membre détient une `ThreadKey` pour ce salon.

Côté client (`useLiveKit.ts`, correctif de l'audit FC3 du 01/10) :

```ts
const threadKey = await decryptThreadKeyWithRsa(encryptedThreadKey, privateKey.value);
// Clé média dédiée, liée au salon : la clé de messages n'est pas réutilisée telle quelle.
const mediaKey  = HKDF-SHA256(threadKey, info = "synco-livekit-media-v1:" + threadId);
await keyProvider.setKey(mediaKey);

const room = new Room({ e2ee: { keyProvider, worker } });
await room.setE2EEEnabled(true);   // indispensable : l'option e2ee seule n'active rien
await room.connect(url, token);
if (!room.isE2EEEnabled) { /* on coupe : échec fermé */ }
```

Avant ce correctif, `setE2EEEnabled(true)` n'était jamais appelé : l'option `e2ee` du constructeur installe le worker mais laisse `encryptionType = NONE`, si bien que **le média partait en clair vers le SFU** pour tous les salons.

Le champ `e2eeKey` renvoyé par l'API est du **ciphertext RSA-OAEP**, inexploitable sans la clé privée du destinataire. **`synco_api` ne manipule jamais la clé AES en clair**, et le serveur LiveKit ne la reçoit jamais du tout.

Le chiffrement/déchiffrement média s'exécute dans un **Web Worker dédié** (`livekit-client.e2ee.worker.js`), isolé du thread principal.

## 3. Échec fermé et choix explicite

| Situation | Comportement |
|---|---|
| Membre du salon avec une `ThreadKey` | ✅ E2EE activé et vérifié après connexion ; badge vert « Chiffré de bout en bout » |
| Clé présente mais indéchiffrable (PIN verrouillé, échec RSA) | ⛔ L'appel n'est **pas** rejoint (message d'erreur) |
| Salon chiffré (`e2eeRequired`) mais copie de clé manquante | ⛔ L'appel n'est **pas** rejoint |
| Salon sans aucune `ThreadKey` | ⚠️ Rejoint **seulement** après confirmation dans `UnencryptedCallConfirm.vue` ; badge jaune « Non chiffré » |
| Invité par lien d'invitation, salon chiffré | ⛔ Refusé par l'API (409) : il ne pourrait ni entendre ni être entendu |
| Invité par lien d'invitation, salon sans clé | ⚠️ Rejoint en clair, badge jaune visible |

Un participant distant qui publie en clair dans un salon chiffré déclenche un avertissement (`ParticipantEncryptionStatusChanged`).

## 4. Contrôle d'accès à la salle

Le jeton LiveKit est un **JWT signé** par `API_SECRET`, valable **2 heures**, portant :

| Droit | Valeur |
|---|---|
| `roomJoin` | `true` |
| `room` | l'id du Thread (une salle = un salon) |
| `canPublish` | **conditionnel** (voir ci-dessous) |
| `canSubscribe` | `true` |
| `canUpdateOwnMetadata` | `true` |

### `canPublish` — durcissement de l'audit `M5`

```ts
const canPublish = !!perm.permissions['WRITE']
    && !(thread.isReadOnly
         && thread.ownerId !== userId
         && !thread.writersId.includes(userId)
         && !perm.permissions['FOLDER_MANAGE']);
```

Le droit de **diffuser** audio/vidéo reflète le modèle de permission du salon texte : un invité ou un non-rédacteur d'un salon en lecture seule ne peut pas diffuser simplement parce que l'accès vocal lui a été accordé. Auparavant, `canPublish` était vrai pour tout le monde.

`requireThreadAccess()` aligne la vérification de la route HTTP sur celle du `join-thread` WebSocket (audit `P4`) — un salon privé ne peut pas être rejoint vocalement en contournant le canal texte.

## 5. Ce que le serveur LiveKit voit malgré l'E2EE

Même en mode E2EE actif, le SFU **doit** lire les en-têtes RTP pour router les flux :

| Donnée | Visible par le SFU ? |
|---|---|
| Contenu audio/vidéo | ❌ Non (si E2EE actif) |
| Identité des participants | ✅ **Oui** (`identity` dans le jeton) |
| Qui parle, quand (`ActiveSpeakersChanged`) | ✅ **Oui** |
| Micro/caméra/partage d'écran activés | ✅ **Oui** |
| Débit, qualité de connexion, couches simulcast | ✅ **Oui** |
| Durée de participation | ✅ **Oui** |
| Adresses IP | ✅ **Oui** |

De plus, `getWSData()` diffuse via le socket Synco les **métadonnées de profil sérialisées** de chaque participant (`JSON.stringify(...user)`), et `voc:update` relaie la liste des participants à toute la salle. L'existence et la composition d'un appel ne sont donc pas confidentielles.

## 6. Optimisations de transport (sans impact cryptographique)

- **Simulcast** : trois couches de qualité publiées (h180/h360/h720 pour la caméra, h360fps15/h720fps15 pour le partage d'écran) ; le SFU ne transmet à chaque spectateur que la couche adaptée à sa bande passante.
- `adaptiveStream` et `dynacast` réduisent la bande passante inutilisée.
- Les événements en rafale (`ActiveSpeakersChanged`, `ConnectionQualityChanged`) sont groupés sur une frame d'animation.
- Volume par participant via un `GainNode` Web Audio, persisté en `localStorage`.

Le simulcast est compatible avec l'E2EE LiveKit : chaque couche est chiffrée indépendamment.

## 7. Modération

Une route d'expulsion existe côté `synco_api`. Un mute forcé côté serveur ne déclenche que `TrackMuted` (pas `LocalTrackPublished/Unpublished`), d'où le `syncLocalState()` explicite côté client pour ne pas afficher un micro « actif » après un mute distant.

⚠️ **Expulser un participant ne fait pas tourner la `ThreadKey`.** Il conserve la clé et pourrait déchiffrer un flux capté par un autre moyen. Voir fiche [12](./12-perimetre-limites-modele-de-menace.md).

## 8. Aucune persistance

Pas d'enregistrement d'appel, pas de transcription, pas de modèle Prisma d'historique. Seules subsistent les métadonnées de présence transitant par le socket.

## 9. Comparatif P2P vs LiveKit

| | Appel privé (P2P) | Salon vocal (LiveKit) |
|---|---|---|
| Topologie | Direct, pair-à-pair | SFU centralisé |
| Participants | 2 | N |
| Clé E2EE | ECDH éphémère par appel | `ThreadKey` (long terme, partagée) |
| Forward secrecy | ✅ **Oui** | ❌ **Non** |
| Empreinte vérifiable (SAS) | ✅ Oui | ❌ Non |
| Dégradation possible | Navigateur sans Insertable Streams | Absence de `ThreadKey` |
| Statut affiché à l'utilisateur | ✅ Oui (icône + empreinte) | ❌ **Non** |
| Relais tiers | ❌ Jamais (pas de TURN) | ✅ Toujours (le SFU) |
