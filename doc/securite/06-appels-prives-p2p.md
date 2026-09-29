# 06 — Appels privés en pair-à-pair (P2P)

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/composables/useSecurePeer.ts`](../../src/composables/useSecurePeer.ts), [`synco_app/src/assets/utils/peerConfig.ts`](../../src/assets/utils/peerConfig.ts), [`synco_app/src/components/peer/CallOverlay.vue`](../../src/components/peer/CallOverlay.vue) |
| **Infrastructure** | Serveur de signalisation PeerJS (auto-hébergé), STUN Google |
| **Statut** | ✅ **E2EE, double couche** — rien n'est stocké, rien ne transite par `synco_api` |

---

## 1. Ce que couvre ce chapitre

Les **appels vocaux et vidéo 1-à-1** lancés depuis une conversation privée (DM). À distinguer des **salons vocaux de Thread**, qui passent par un SFU LiveKit — voir fiche [07](./07-salons-vocaux-livekit.md).

## 2. Architecture

```
  Alice ◀════════ flux média direct (WebRTC) ════════▶ Bob
    │                                                   │
    └──── signalisation SDP/ICE ──▶ PeerJS ◀────────────┘
                                      │
                             STUN (Google) pour la découverte NAT
```

`synco_api` ne voit **jamais** le flux média. Il n'intervient que pour :
- le socket d'application (notification d'appel entrant, `call:cancelled`) ;
- la résolution de l'identité (le `peerId` est le `sub` Keycloak).

### ⚠️ Pas de TURN — choix explicite

[`peerConfig.ts`](../../src/assets/utils/peerConfig.ts) configure **uniquement du STUN**, sans serveur TURN :

> « Volontairement STUN-only, sans serveur TURN : PeerJS retombe sinon sur sa config par défaut, qui inclut le serveur TURN public `turn.peerjs.com` — un relais tiers accepterait de faire transiter le trafic si la connexion directe échoue, ce qui contredit la promesse "peer-to-peer" affichée à l'utilisateur. »

**Conséquence assumée : un appel qui aboutit est garanti direct. Sur les topologies réseau nécessitant un relais (NAT symétrique des deux côtés, pare-feu d'entreprise restrictif), l'appel échoue purement et simplement.**

C'est un arbitrage confidentialité > disponibilité. Il doit être connu du support : l'échec d'appel n'est pas toujours un bug.

## 3. Trois couches de chiffrement du média

| Couche | Mécanisme | Qui la fournit | Portée |
|---|---|---|---|
| 1 | **DTLS-SRTP** | WebRTC, automatique, non désactivable | Chiffre le transport entre les deux pairs |
| 2 | **Surchiffrement AES-GCM par trame** | Synco, via Insertable Streams | Chiffre le contenu *à l'intérieur* de SRTP |
| 3 | **Canal de contrôle chiffré** | Canal `secure-control` | Signalisation de renégociation, raccrochage |

La couche 2 est celle qui fait la valeur ajoutée : même un pair intermédiaire ou un middlebox capable de terminer DTLS ne verrait que des trames AES-GCM opaques.

## 4. Accord de clé : ECDH P-256 → HKDF → AES-GCM

Une **paire ECDH éphémère** est générée à l'initialisation du `Peer` (`initPeer`), indépendante de l'identité RSA à long terme de l'utilisateur.

```
1. callId = 16 octets de crypto.getRandomValues, en hexadécimal  (generateCallId)
2. Échange des clés publiques ECDH via le canal de données 'secure-control'
3. sharedBits = ECDH(maClePriveeEphemere, clePubliquePairEphemere)   → 256 bits
4. hkdfBase   = importKey(sharedBits, 'HKDF')
5. sessionKey = HKDF-SHA256(
        ikm  = hkdfBase,
        salt = SHA-256(callId),
        info = "SilverTeams-Call-E2EE-Key"
   ) → AES-GCM 256
```

Le sel dérive du `callId`, déjà validé identique des deux côtés : il est donc **unique par appel** et connu des deux pairs **sans aller-retour supplémentaire**.

> Le code documente pourquoi le chaînage se fait en trois étapes explicites : `deriveKey()` ne peut pas enchaîner ECDH → HKDF en un appel, son troisième paramètre décrivant l'algorithme de la clé *finale*, pas une seconde dérivation.

### Confidentialité persistante (forward secrecy)

Les clés ECDH sont **éphémères, régénérées à chaque `initPeer()`** (donc à chaque session applicative). La compromission ultérieure de la clé RSA à long terme d'un utilisateur **ne permet pas** de déchiffrer un appel passé — d'autant qu'aucun flux n'est enregistré.

C'est le seul module de Synco offrant une véritable forward secrecy.

## 5. Protections du protocole de poignée de main

| Attaque | Défense |
|---|---|
| **Rejeu** | Horodatage obligatoire, fenêtre de **30 secondes**. Un message sans `timestamp` est rejeté (pas seulement « le contrôle est sauté ») |
| **Confusion de session / détournement** | `callId` obligatoire et comparé à celui de la session courante. Non-concordance = rejet |
| **Blocage de la négociation** | Délai de garde de **10 secondes** (`KEY_EXCHANGE_TIMEOUT`) : au-delà, le statut passe à `encrypted: false, fingerprint: 'TIMEOUT'` |
| **Trame envoyée avant la clé** | `if (!session.e2eeKey) return;` — la trame est **abandonnée**, jamais transmise en clair |

Le dernier point est important : le pipeline **préfère perdre des trames plutôt que d'en émettre une non chiffrée**. C'est un choix « fail-closed » correct.

## 6. Surchiffrement par trame — Insertable Streams

```ts
// Émission
const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.e2eeKey, data);
chunk.data = [iv ‖ ciphertext].buffer;

// Réception
const iv = payload.slice(0, 12);
const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, session.e2eeKey, payload.slice(12));
```

Chaque trame encodée porte **son propre IV de 96 bits** — pas de réutilisation d'IV possible.

Activé par `encodedInsertableStreams: true` dans `PEER_CONFIG`, et par le drapeau `_e2eeSetup` posé sur chaque sender/receiver pour ne jamais brancher le transform deux fois (une renégociation rappelle `setupMediaEncryption`).

### ⚠️ Dégradation si l'API n'est pas supportée

```ts
if (!('createEncodedStreams' in RTCRtpSender.prototype)) {
    console.warn('[SECURE-PEER] Insertable Streams API non supportée. Le flux média ne sera pas doublement chiffré.');
    return;
}
```

Sur un navigateur sans Insertable Streams (**Safari et Firefox notamment**, à la date de ce rapport), le surchiffrement est **silencieusement désactivé**. L'appel reste protégé par DTLS-SRTP, mais perd la couche 2.

➡️ **Aucun avertissement n'est remonté à l'utilisateur** — seulement un `console.warn`. C'est une divergence entre la promesse affichée (« chiffré de bout en bout ») et la protection réellement en place selon le navigateur.

## 7. Empreinte de vérification (SAS)

```ts
generateFingerprint(sessionKey, callId)
  = SHA-256(callId ‖ octets bruts de la clé de session)
       → 16 premiers caractères hexadécimaux, en majuscules
```

Affichée dans `CallOverlay.vue`. Les deux correspondants peuvent la comparer **de vive voix** : identique des deux côtés = pas d'intercepteur.

`SecurityStatus` porte trois états :
- `encrypted` — la clé partagée est établie ;
- `authenticated` — l'utilisateur a **manuellement confirmé** l'empreinte ;
- `fingerprint` — la chaîne à comparer (ou `'TIMEOUT'`).

`authenticated` reste à `false` tant que personne n'a vérifié : l'interface distingue donc « chiffré » de « chiffré **et** authentifié ».

## 8. Renégociation manuelle

PeerJS ne réagit jamais à l'événement `negotiationneeded` (son négociateur interne ne l'écoute pas). Une piste vidéo ajoutée en cours d'appel (activation de la caméra, partage d'écran) ne serait donc jamais réellement négociée.

Synco renégocie lui-même via les messages `RENEGOTIATE_OFFER` / `RENEGOTIATE_ANSWER` **sur le canal `secure-control` déjà chiffré et authentifié** — la nouvelle offre SDP ne repasse pas par le serveur de signalisation.

## 9. Fin d'appel et anti-blocage

| Situation | Mécanisme |
|---|---|
| Raccrochage d'un appel établi | Message `HANGUP` sur le canal sécurisé |
| Annulation **avant** décrochage | Événement socket `call:cancelled` (PeerJS ne relaie rien dans ce cas) |
| Personne ne décroche | `CALL_RING_TIMEOUT` = 30 s, puis abandon automatique et notification « appel manqué » |
| Blip réseau | `peerReconnector` reprogramme une reconnexion (PeerJS ne se reconnecte pas seul) |

## 10. Ce que le serveur sait quand même

Bien que le média soit entièrement E2EE et jamais stocké :

| Donnée | Connue du serveur ? |
|---|---|
| Contenu audio/vidéo | ❌ **Non** |
| Qui appelle qui | ✅ **Oui** (socket d'appel, notification) |
| Quand, et combien de temps | ✅ **Oui** (début via signalisation, `call:cancelled`) |
| Adresses IP des deux pairs | ✅ **Oui** (serveur de signalisation + candidats ICE) |
| Existence d'une piste vidéo | ⚠️ Partiellement (SDP échangé lors de la négociation initiale) |

Le serveur de signalisation PeerJS voit la **négociation SDP/ICE initiale en clair** — donc les adresses IP publiques et locales des deux participants. Seules les **renégociations ultérieures** passent par le canal chiffré.

## 11. Aucune persistance

Rien n'est enregistré : ni flux, ni transcription, ni métadonnée d'appel en base. Il n'existe **aucun modèle Prisma d'historique d'appel P2P**. Les traces sont volatiles (journaux du serveur de signalisation, notifications éphémères).
