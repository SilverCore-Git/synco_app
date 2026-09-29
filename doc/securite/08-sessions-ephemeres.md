# 08 — Sessions éphémères

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/composables/usePrivatMeet.ts`](../../src/composables/usePrivatMeet.ts), [`synco_app/src/views/OrgSpace/views/PrivateMeetView.vue`](../../src/views/OrgSpace/views/PrivateMeetView.vue) |
| **Modèles Prisma** | **aucun** — rien n'est jamais persisté |
| **Statut** | ✅ **E2EE, zéro persistance** — le mode le plus confidentiel de Synco |

---

## 1. Ce que c'est

Une **session éphémère** est une conversation texte + transfert de fichiers **strictement de point à point**, lancée depuis une conversation privée (bouton « Session éphémère » dans `ChatView.vue`). Elle ne laisse **aucune trace** :

- aucun modèle Prisma, aucune écriture en base ;
- rien ne transite par `synco_api` hormis l'invitation initiale (socket) ;
- à la fermeture, tout est purgé de la mémoire du navigateur.

C'est l'équivalent Synco d'une conversation « off the record ».

## 2. Architecture

```
  Alice ◀════ PeerJS DataConnection (WebRTC DataChannel, DTLS) ════▶ Bob
    │                                                                 │
    └──── invitation / refus / annulation ──▶ socket Synco ◀──────────┘
```

Comme pour les appels P2P, la configuration est **STUN-only, sans TURN** (`PEER_CONFIG` partagé) : la connexion est garantie directe, ou elle échoue.

### Isolation de l'espace de noms PeerJS

`useSecurePeer.ts` (appels) et `usePrivatMeet.ts` (sessions éphémères) enregistrent tous deux un `Peer` sur le **même serveur de signalisation** et sont initialisés côte à côte dans `OrgLayout.vue`. Deux objets `Peer` revendiquant le même identifiant entrent en conflit — le serveur ne maintient qu'une connexion par id.

D'où le suffixe `-meet` (`MEET_PEER_SUFFIX`) appliqué à l'identifiant des sessions éphémères, qui isole complètement les deux espaces de noms. C'était la cause exacte d'une boucle « Établissement du canal sécurisé » qui s'ouvrait et se refermait sans fin.

## 3. Clés de session — jetables et indépendantes de l'identité

À chaque session, **une nouvelle paire RSA-OAEP 4096 bits est générée à la volée** :

```ts
const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 4096, publicExponent: 65537, hash: "SHA-256" },
    ...
);
sessionPrivateKey.value = keyPair.privateKey;   // vit uniquement le temps de la session
```

Points essentiels :

- **Ces clés n'ont aucun rapport avec l'identité RSA à long terme de l'utilisateur** (`crypto.ts` / `privateKey`). Le PIN n'est même pas requis pour une session éphémère.
- Elles ne sont **jamais envoyées au serveur**, sous aucune forme.
- Elles disparaissent avec la session.

➡️ Conséquence : **forward secrecy réelle**. Compromettre la clé RSA à long terme d'un utilisateur ne donne aucune prise sur une session éphémère passée.

➡️ Revers de la médaille : **aucun rattachement à l'identité vérifiée**. La clé publique échangée n'est ni signée par la clé d'identité, ni comparée à un cache TOFU, ni exposée sous forme d'empreinte vérifiable. Le canal est confidentiel, mais son authentification repose entièrement sur le serveur de signalisation (qui garantit que le `peerId` correspond bien à l'`OrgMember.id` attendu) — voir §8.

## 4. Poignée de main

```
conn.on('open')  →  { type: 'E2EE_HANDSHAKE', publicKeyJWK }   (des deux côtés)
                 →  peerPublicKeyJWK stockée
```

Une seule étape, pas de confirmation en retour, pas d'horodatage anti-rejeu (contrairement aux appels P2P). Tant que `peerPublicKeyJWK` est nulle, `sendEncryptedMessage()` **refuse d'envoyer** — pas de repli en clair.

## 5. Messages texte

Réutilise exactement `encryptForPeer()` / `decryptFromPeer()` de [`crypto.ts`](../../src/assets/utils/crypto.ts) :

```
messageKey      = AES-GCM 256 aléatoire (une par message)
ciphertext      = AES-GCM(messageKey, iv, texte)
encryptedAesKey = RSA-OAEP(clePubliqueSessionDuPair, messageKey)
→ conn.send({ type: 'ENCRYPTED_MESSAGE', ciphertext, encryptedAesKey, iv })
```

Pas de `selfEncryptedAesKey` ici : l'expéditeur conserve simplement le texte en clair dans son propre état local (`messages.value`), il n'a rien à relire depuis un stockage.

## 6. Transfert de fichiers chiffré

Utilise `encryptBufferForPeer()` / `decryptBufferFromPeer()` — mêmes primitives, mais sur `ArrayBuffer` brut plutôt que sur chaîne.

> **Pas de base64 ici** : les objets envoyés par une `DataConnection` PeerJS utilisent sa sérialisation binaire native (le même mécanisme qui découpe déjà les gros payloads). Encoder en base64 n'ajouterait que ~33 % de taille pour rien.

### Protocole en trois temps

| Étape | Message | Contenu |
|---|---|---|
| 1 | `FILE_META` | `fileId` (UUID), nom, type, taille, `totalChunks`, `encryptedAesKey`, `iv` |
| 2 | `FILE_CHUNK` × N | morceaux de **64 Ko** du ciphertext, indexés |
| 3 | `FILE_RECEIVED` | accusé de réception **après déchiffrement réussi** |

Le découpage manuel en morceaux de 64 Ko n'est pas une contrainte cryptographique : **le fichier entier est chiffré en une seule opération AES-GCM**, puis le ciphertext est découpé. Le découpage existe uniquement pour afficher une progression réelle des deux côtés (PeerJS chunke en interne mais ne remonte aucun événement exploitable).

### Limites

| Paramètre | Valeur | Raison |
|---|---|---|
| Taille max | **200 Mo** | Tout transite et reste en mémoire (chiffrement + tampon complet des deux côtés), pas de streaming |
| Taille de morceau | 64 Ko | Granularité de la progression |

### Accusé de réception distinct

`confirmedReceived` (déclenché par `FILE_RECEIVED`) est **distinct** de `status: 'done'` : le premier signifie « le correspondant a reçu **et déchiffré** », le second seulement « j'ai fini d'envoyer tous les morceaux ». Cette distinction alimente `hasPendingFileTransfer`, qui **empêche de fermer la session** tant qu'un transfert n'est pas réellement terminé des deux côtés.

## 7. Purge mémoire à la fermeture

`cleanupMeetState()` est explicite sur un point souvent oublié :

```ts
// Vider messages.value ne suffit pas à réellement libérer un fichier de la
// mémoire : chaque bulle fichier porte un Blob URL (URL.createObjectURL, côté
// envoyeur ET receveur) qui garde le Blob sous-jacent vivant tant qu'il n'est
// pas explicitement révoqué — sans ça, le contenu déchiffré resterait
// accessible en mémoire (via cette URL) bien après la fin de la session.
for (const msg of messages.value) {
    if (msg.fileUrl) URL.revokeObjectURL(msg.fileUrl);
}
messages.value = [];
incomingFileTransfers.clear();   // purge les transferts entrants incomplets
```

C'est une attention rare et correcte : sans `revokeObjectURL`, le contenu déchiffré resterait récupérable via l'URL blob bien après la fin de la session.

L'objet `Peer` lui-même **n'est pas détruit** (c'est le point d'écoute pour toute la session d'organisation), mais les clés de session et tous les contenus le sont.

## 8. Indicateur de sécurité affiché

`PrivateMeetView.vue` affiche un bouclier dont la couleur reflète `connectionType` :

| État | Icône | Libellé |
|---|---|---|
| Direct | 🔒 vert (`bi-shield-lock-fill`) | « Chiffré de bout en bout, P2P » |
| Relayé | ⚠️ jaune (`bi-shield-exclamation`) | « Chiffré — connexion relayée » |

L'utilisateur est donc informé si la connexion n'est pas strictement directe. C'est le seul module, avec les appels P2P, à exposer un statut de sécurité.

> Note : `PEER_CONFIG` étant STUN-only, le cas « relayé » ne devrait pas se produire via `turn.peerjs.com`. L'indicateur reste utile si la configuration ICE évolue.

## 9. Survie à la navigation

L'état est au **niveau module** (pas par instance de composant) : une session éphémère survit au changement de route, de salon ou d'espace de travail. Elle ne se termine que sur :

- le bouton « raccrocher » (`requestClose`) ;
- un refus (`privateMeet:declined`) ou une annulation (`privateMeet:cancelled`) ;
- la fermeture du canal par le correspondant ;
- un délai d'attente sans réponse.

`close({ flush: true })` fait circuler un message de fermeture dans le canal avant de le fermer, pour que l'autre côté soit prévenu.

## 10. Ce que le serveur sait

| Donnée | Connue du serveur ? |
|---|---|
| Contenu des messages | ❌ **Non** |
| Contenu des fichiers | ❌ **Non** |
| Noms de fichiers, tailles | ❌ **Non** (ils transitent dans le canal P2P) |
| Qu'une session a été initiée, entre qui et qui | ✅ **Oui** (`privateMeet:call` sur le socket) |
| Quand elle a commencé | ✅ **Oui** |
| Quand elle s'est terminée | ⚠️ Partiellement (annulation/refus passent par le socket ; une fermeture normale passe par le canal P2P) |
| Adresses IP des deux pairs | ✅ **Oui** (signalisation + candidats ICE) |

## 11. Synthèse comparative

| | Session éphémère | DM classique |
|---|---|---|
| Persistance | ❌ Aucune | ✅ En base |
| Clés | Éphémères, par session | Identité RSA à long terme |
| Forward secrecy | ✅ **Oui** | ❌ Non |
| Vérification TOFU de la clé | ❌ **Non** | ✅ Oui |
| Empreinte affichée | ❌ Non | ✅ Oui (au changement de clé) |
| Transite par `synco_api` | ❌ Non | ✅ Oui |
| Pièces jointes | En mémoire, 200 Mo max | Stockées, chiffrées, sans limite comparable |
| Fonctionne derrière NAT symétrique | ❌ Non | ✅ Oui |
