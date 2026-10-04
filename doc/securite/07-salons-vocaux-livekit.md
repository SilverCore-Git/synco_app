# 07 — Salons vocaux de Thread (LiveKit)

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/composables/useLiveKit.ts`](../../src/composables/useLiveKit.ts), [`src/routes/LiveKit.ts`](../../../synco_api/src/routes/LiveKit.ts) |
| **Infrastructure** | Serveur LiveKit (SFU) auto-hébergé |
| **Statut** | ✅ **E2EE** quand le salon possède une `ThreadKey` — ❌ **non chiffré au niveau applicatif** sinon |

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

Côté client :

```ts
// useLiveKit.ts
const threadKey = await decryptThreadKeyWithRsa(encryptedThreadKey, privateKey.value);
const roomKey   = await crypto.subtle.exportKey('raw', threadKey);
await keyProvider.setKey(roomKey);

e2eeOptions = {
    keyProvider,                                    // ExternalE2EEKeyProvider
    worker: new Worker(E2EEWorker, { type: 'module' })
};
new Room({ e2ee: e2eeOptions, ... });
```

Le champ `e2eeKey` renvoyé par l'API est du **ciphertext RSA-OAEP**, inexploitable sans la clé privée du destinataire. **`synco_api` ne manipule jamais la clé AES en clair**, et le serveur LiveKit ne la reçoit jamais du tout.

Le chiffrement/déchiffrement média s'exécute dans un **Web Worker dédié** (`livekit-client.e2ee.worker.js`), isolé du thread principal.

## 3. ⚠️ Dégradation silencieuse : `e2eeKey: null`

```ts
async function unwrapRoomKey(encryptedThreadKey) {
    if (!encryptedThreadKey || !privateKey.value) return null;
    ...
}
// puis :
if (roomKey) { /* E2EE activé */ }
// sinon : e2eeOptions = undefined → salle NON chiffrée au niveau applicatif
```

Quand `roomKey` est `null`, la salle est créée **sans options E2EE**. Le média reste protégé par DTLS/TLS entre chaque participant et le SFU, mais **le serveur LiveKit voit le flux en clair**.

Le code traite ce cas comme « cet appel n'est pas E2EE », **pas comme une erreur**.

### Quand cela se produit

| Situation | E2EE ? |
|---|---|
| Membre du salon avec une `ThreadKey` | ✅ Oui |
| **Invité rejoignant par lien d'invitation** (`ThreadInvite`) | ❌ **Non** — pas de `ThreadKey` |
| Salon créé avant l'activation de l'E2EE (pas de ligne `ThreadKey`) | ❌ **Non** |
| Utilisateur n'ayant pas déverrouillé son PIN (`privateKey` nulle) | ❌ **Non** |
| Échec du déchiffrement RSA de la clé | ❌ **Non** (`console.error` puis `null`) |

### ⚠️ Conséquence critique : dégradation de tout le salon

LiveKit ne permet pas de mélanger participants E2EE et non-E2EE dans une même salle de façon utile : un participant sans clé ne peut pas déchiffrer les flux des autres et ses propres flux ne sont pas chiffrés. **L'arrivée d'un invité sans `ThreadKey` dégrade concrètement la confidentialité de l'appel pour tout le monde.**

➡️ **Rien dans l'interface n'indique explicitement si l'appel en cours est E2EE ou non**, contrairement aux appels P2P qui affichent un statut de sécurité et une empreinte. C'est l'écart le plus significatif entre la promesse produit et la réalité technique relevé dans ce rapport.

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
