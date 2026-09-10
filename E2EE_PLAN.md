# Plan — Chiffrement des sessions IA (synco_app)

> Ce document est un des 3 plans jumeaux (`Synco_AI_Gateway`, `synco_api`, `synco_app`) écrits pour être
> donnés chacun à une session Claude dédiée, travaillant dans un seul repo à la fois, sans accès aux deux
> autres. Le **format binaire/wire (section 2)** est identique dans les 3 fichiers — ne pas le modifier sans
> répercuter le changement dans les deux autres plans.

## 1. Contexte et objectif

Objectif : pour les sessions IA utilisant le provider `gateway` (*"Passerelle Synco AI (auto-hébergée)"*),
`synco_api` ne doit jamais voir le contenu en clair. Ce repo (`synco_app`, le frontend Vue) est responsable
de : (a) générer et distribuer une clé symétrique partagée par organisation, (b) la transmettre directement à
`Synco_AI_Gateway` à chaque appel (jamais via `synco_api`), (c) déchiffrer côté client tout ce qu'il relit
depuis `synco_api` (historique, titres de sidebar).

**Bonne nouvelle** : ce repo a déjà toute l'infrastructure crypto nécessaire. `src/assets/utils/crypto.ts`
implémente déjà un système E2EE complet (RSA-OAEP 4096 par utilisateur, clé privée déverrouillée par PIN et
jamais persistée en clair, enveloppe RSA+AES-GCM via `encryptForPeer`/`decryptFromPeer`, distribution de clé
partagée pour les threads/spaces via `generateThreadKey`/`encryptThreadKeyForMember`/
`decryptThreadKeyWithRsa`). Ce plan consiste essentiellement à **répliquer le pattern `ThreadKey` existant**
pour une nouvelle ressource "clé de session IA par org", pas à inventer un nouveau système crypto.

**Incohérence actuelle à corriger** : `AIService.ts` a DÉJÀ un chiffrement E2EE pour les sessions IA — mais
seulement sur l'ancien flux client-driven (`syncSession()`/`loadSession()`, providers `local`/`custom`, via
`encryptForPeer`/`decryptFromPeer` en auto-chiffrement pour l'utilisateur lui-même). Le nouveau flux agent
serveur (provider `gateway`, `chatAgentTurn`/`resumeAgentTurn`) ne passe PAS par ce chiffrement — c'est
précisément le trou que ce plan comble, avec un schéma de clé *partagée par org* (pas juste auto-chiffrée
pour soi-même) puisque plusieurs membres de l'org doivent pouvoir relire le même historique.

**Hors périmètre** : les providers `openai`/`mistral`/`gemini` (flux `sfetch('/api/orgs/${orgId}/ai/chat', ...)`)
restent inchangés — ne touche pas à ce chemin.

## 2. Format binaire (wire format) — identique aux 2 autres plans, ne pas diverger

- **Algorithme** : AES-256-GCM, clé 256 bits.
- **Nonce** : 12 octets aléatoires par opération.
- **Tag** : 16 octets, standard GCM.
- **Valeur sur le fil** : `"gcm1:" + base64_standard(nonce(12) || ciphertext || tag(16))`.
  - En Web Crypto : `crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, plaintextBytes)`
    retourne **déjà** `ciphertext || tag` concaténés (comportement natif du navigateur) — il suffit de
    préfixer avec le `nonce` généré, puis encoder en base64 standard (`btoa`/`Buffer`, PAS url-safe).
  - `base64_standard` = RFC 4648 §4 avec padding.
- **AAD** : chaîne UTF-8 `"{session_id}:{message_id}:{field_name}"`, encodée en `Uint8Array` via
  `TextEncoder`. `field_name` : `"content"`, `"tool_result"`, `"tool_call_arguments:{call_id}"`, `"title"`
  (avec `message_id = "__session_title__"`), `"pending_tool_call_args"` (avec `message_id = "__pending__"`).
- **Valeurs JSON** (`toolResult`, `toolCalls[].arguments`) : `JSON.stringify(...)` avant chiffrement,
  `JSON.parse(...)` après déchiffrement.
- **`null`/absent** : ne jamais chiffrer, laisser tel quel.

### Vecteur de test (identique au plan `Synco_AI_Gateway` — sert à vérifier l'interopérabilité TS↔Rust sans
jamais faire tourner les deux implémentations ensemble ; régénère toi-même les octets bruts depuis les hex
ci-dessous plutôt que de faire confiance à un éventuel problème de copier-coller) :

```
key (hex, 32 octets)   : d82f2646d1113270f58fa3daf64de7e9f64253123a0ec7fdbaa24e34081d791
key (base64)            : 2C8mRtERMnD1j6Pa9k3n6fZCUxI6Dsf9uqJONAgdeRE=
nonce (hex, 12 octets)  : 1024c8c26840d416f50b5072
session_id              : sess_test0000000000000000000001
message_id              : msg_test00000000000000000000001
field_name               : content
AAD (utf8)               : sess_test0000000000000000000001:msg_test00000000000000000000001:content
plaintext (utf8)         : Bonjour, ceci est un message de test pour Synco AI.
wire_value                : gcm1:ECTIwmhA1Bb1C1ByL8IECZj8SkBl2TYmk9665e/jnrCQNjYdR+CMirRU75qIq5pxnrallgkaWQtrQreT8eCSCf6JAzUrY5mTb/Ez42WxSw==
```
Écris un test qui importe `key` brute via `crypto.subtle.importKey('raw', ...)`, déchiffre `wire_value` avec
l'AAD ci-dessus, et vérifie que le résultat === `plaintext`. Si ça échoue, le bug est dans l'implémentation
TS (mauvais split nonce/ciphertext, mauvais AAD, mauvais `tagLength`), pas dans le vecteur.

## 3. Nouvelle brique : clé de session IA par organisation

### 3.1 Génération/enveloppe — mirror exact de `generateThreadKey`/`encryptThreadKeyForMember`

Dans `src/assets/utils/crypto.ts`, regarde d'abord précisément comment `generateThreadKey`,
`encryptThreadKeyForMember(rawKey, recipientPublicKey)` et `decryptThreadKeyWithRsa(encryptedKey, iv,
privateKey)` sont implémentées (signatures exactes, format retourné). Ajoute des fonctions analogues
(ou réutilise-les directement si elles sont déjà génériques et non spécifiques aux threads — vérifie) :
- `generateAiSessionKey(): Promise<CryptoKey>` — `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])`.
  Doit être `extractable: true` (contrairement à la clé privée RSA de l'utilisateur) puisqu'elle doit être
  exportée en bytes bruts pour (a) être enveloppée RSA pour chaque membre, (b) être envoyée en clair (base64)
  au gateway via TLS.
- `wrapAiSessionKeyForMember(rawKeyBytes: ArrayBuffer, recipientPublicKey: CryptoKey): Promise<{ encryptedKey: string, iv?: string }>`
  — même schéma d'enveloppe que `encryptThreadKeyForMember`.
- `unwrapAiSessionKey(encryptedKey: string, iv: string | undefined, privateKey: CryptoKey): Promise<ArrayBuffer>`
  — inverse, utilise `privateKey.value` (la ref globale déjà déverrouillée par PIN, cf. `crypto.ts` existant).

### 3.2 Nouveau service : `src/services/AiSessionKeyService.ts` (ou étendre `AIService.ts` — à toi de juger
selon la taille, mais garder ça séparé de la logique HTTP de chat est probablement plus propre)

- Un `ref<CryptoKey | null>` en mémoire (jamais persisté en `localStorage`, cohérent avec la convention
  existante pour `privateKey`), un par org actuellement ouverte (`Map<orgId, CryptoKey>` ou juste re-fetch à
  chaque changement d'org — vérifie le pattern déjà utilisé pour `openedOrg` dans `var.ts`).
- `async function ensureAiSessionKey(orgId: string): Promise<CryptoKey>` :
  1. `GET /api/orgs/:orgId/ai/key` (nouvel endpoint, cf. plan `synco_api` §4.3).
  2. Si trouvé : déchiffrer avec `unwrapAiSessionKey` + `privateKey.value`, importer en `CryptoKey` via
     `crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt'])`, cacher, retourner.
     Si `privateKey.value` est `null` (PIN pas encore déverrouillé) : lever une erreur typée que l'appelant
     (UI) doit traduire en message "déverrouillez votre sécurité pour accéder à l'IA", même pattern que le
     `[🔒 Conversation chiffrée. Clé privée manquante.]` déjà affiché ailleurs dans `AIService.ts`.
  3. Si absent (404) : c'est la première fois que quelqu'un active le provider `gateway` pour cette org —
     générer une nouvelle clé (`generateAiSessionKey`), l'envelopper pour soi-même
     (`wrapAiSessionKeyForMember` avec sa propre clé publique), `POST /api/orgs/:orgId/ai/key`. **Décision à
     prendre** : qui a le droit de faire ce bootstrap ? Probablement restreint aux mêmes permissions que
     `AISettings.vue`/`saveSettings()` (admin d'org) — vérifie quelle vérification de permission encadre déjà
     l'écriture de `activeModules.aiConfig` côté frontend/route, et applique la même règle ici pour cohérence
     (même si l'endpoint `synco_api` fera de toute façon sa propre vérification serveur).
- `async function getAiSessionKeyRawBase64(orgId: string): Promise<string>` — retourne la clé en base64
  standard (`crypto.subtle.exportKey('raw', key)` → base64), prête à poser dans le header `X-Session-Key`.
- Partage avec les autres membres de l'org (pour qu'ils puissent, eux aussi, lire l'historique) : nécessite
  un flux où un membre qui a DÉJÀ la clé en enveloppe pour un NOUVEAU membre (qui vient de rejoindre l'org, ou
  qui n'avait pas encore de ligne `AiSessionKey`). Regarde comment ce cas est géré aujourd'hui pour
  `ThreadKey`/`WorkspaceKey` (probablement déclenché à l'ouverture d'un écran, ou par un admin) et réplique
  exactement le même déclencheur pour rester cohérent avec le reste de l'app plutôt que d'introduire un
  nouveau pattern UX.

## 4. Changements dans `src/services/AIService.ts`

### 4.1 `gatewayFetch` (méthode privée, lignes ~55-68)
Ajouter le header `X-Session-Key` :
```ts
const sessionKeyB64 = await getAiSessionKeyRawBase64(orgId); // nouveau
return fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {}),
        'X-Session-Key': sessionKeyB64,
    },
    body: JSON.stringify(body),
    signal,
});
```
Nécessite de faire passer `orgId` jusqu'à `gatewayFetch` (vérifie s'il l'a déjà — `chatAgentTurn`/
`resumeAgentTurn` l'ont sûrement déjà dans leur propre scope). `listGatewayModels` (lignes ~384-402) n'a PAS
besoin de ce header — elle ne touche à aucun contenu de session, laisse-la inchangée.

### 4.2 `fetchSessions()` (lignes ~420-430) — sidebar
Après réception de la liste, pour chaque session avec `encryptionScheme` non-null (nouveau champ renvoyé par
`synco_api`, cf. plan `synco_api` §4.1), déchiffrer `title` avec la clé de session AES (AAD :
`"{session.id}:__session_title__:title"`) avant de l'assigner à `chatSessions`. Si la clé n'est pas
disponible (PIN verrouillé), afficher un placeholder (`"🔒 Titre chiffré"`) plutôt que planter.

### 4.3 `loadSession(id)` (lignes ~489-526) — trois formats à distinguer maintenant
1. **Legacy le plus ancien** : `messages` est directement un `StoredMessage[]` en clair (pré-existant, avant
   tout chiffrement) — comportement actuel, inchangé.
2. **Legacy E2EE client-driven** : `messages` a la forme `{ isE2EE: true, ciphertext, encryptedAesKey, iv }`
   (enveloppe RSA+AES-GCM auto-chiffrée, ancien flux `local`/`custom`) — comportement actuel
   (`decryptFromPeer` + `privateKey.value`), inchangé.
3. **Nouveau — gateway-aes-gcm-v1** : `session.encryptionScheme === "gateway-aes-gcm-v1"` → `messages` est un
   `StoredMessage[]` en clair au niveau structure JSON, mais avec `content`/`toolResult`/
   `toolCalls[].arguments` valant des chaînes opaques `"gcm1:..."`. Récupérer la clé via
   `ensureAiSessionKey(orgId)`, puis déchiffrer chaque champ concerné (AAD par champ, cf. §2) avant de passer
   le résultat à `convertStoredMessagesToChatMessages` (comportement inchangé à partir de là).
   `pendingToolCall.args` (si présent au niveau session, pas par message) suit le même traitement (AAD
   `"{session.id}:__pending__:pending_tool_call_args"`).

Distingue les 3 cas AVANT de toucher au contenu : `session.encryptionScheme === 'gateway-aes-gcm-v1'` → cas 3 ;
sinon `typeof session.messages === 'object' && session.messages.isE2EE` → cas 2 ; sinon → cas 1
(`isStructuredAgentTranscript` existant peut rester tel quel, appliqué APRÈS déchiffrement pour le cas 3).

### 4.4 `syncSession()` (lignes ~552-603) — écriture du titre pour le nouveau flux
Ce chemin reste tel quel pour les providers `local`/`custom` (cas 2 ci-dessus). Pour le provider `gateway`,
ce n'est PAS `syncSession()` qui écrit les messages (c'est `Synco_AI_Gateway` qui le fait directement côté
serveur, cf. plan gateway) — mais le TITRE doit être posé côté client, puisque `synco_api` ne peut plus le
dériver lui-même (cf. plan `synco_api` §4.2). Ajoute une fonction dédiée :
```ts
async function setEncryptedSessionTitle(orgId: string, sessionId: string, plainTitle: string) {
    const key = await ensureAiSessionKey(orgId);
    const encryptedTitle = await encryptField(key, sessionId, '__session_title__', 'title', plainTitle.slice(0, 60));
    await sfetch(`/api/orgs/${orgId}/ai/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: encryptedTitle }),
    });
}
```
À appeler juste après l'envoi du tout premier message d'une nouvelle session gateway (dans `OrgAI.vue`,
`sendMessageViaAgent`, cf. §5) — le titre est calculé à partir du texte que l'utilisateur vient de taper,
donc disponible en clair côté client à ce moment précis, avant même que le gateway ne réponde.

### 4.5 `deleteSession()` (lignes ~528-544) — aucun changement, opère sur l'id, pas le contenu.

## 5. Changements dans `src/views/OrgSpace/views/OrgAI.vue`

- `sendMessageViaAgent` (lignes ~979-999) : si c'est le tout premier message d'une session gateway
  (`sessionId` encore vide/juste créé, ou `messages.value.length === 0` avant envoi), appeler
  `setEncryptedSessionTitle(orgId, sessionId, userText)` (fire-and-forget, ne pas bloquer l'envoi du message
  sur ça).
- `consumeAgentStream` (lignes ~833-876) : **aucun changement** — le flux SSE en direct depuis le gateway
  reste en clair (canal direct navigateur↔gateway déjà de confiance), donc l'affichage live n'est pas
  affecté par ce plan. Seul le rechargement d'historique (`loadSession`) est concerné.
- Watcher `fetchSessions()` au montage (lignes ~1078-1082) : aucun changement structurel, bénéficie
  automatiquement du déchiffrement ajouté dans `fetchSessions()` (§4.2).

## 6. Changements dans `src/views/OrgSpace/views/settings/views/AISettings.vue`

- Dans `saveSettings()` (lignes ~360-428), quand l'admin sélectionne/confirme le provider `gateway` pour la
  première fois (transition depuis un autre provider, ou premier réglage IA de l'org) : déclencher
  `ensureAiSessionKey(orgId)` pour provisionner la clé AVANT ou juste après l'écriture de `activeModules.aiConfig`
  — si ça échoue (pas de permission, RSA verrouillé), bloquer la sauvegarde avec un message clair plutôt que
  de laisser l'org dans un état "provider=gateway mais pas de clé" qui ferait échouer silencieusement le
  premier chat de n'importe quel membre.

## 7. Changements dans `src/views/OrgSpace/components/layouts/ThreadsBar.vue`

- Aucun changement structurel attendu — elle consomme `chatSessions` déjà déchiffré par `fetchSessions()`
  (§4.2). Vérifie juste que l'état "titre non déchiffrable" (clé absente/PIN verrouillé) s'affiche proprement
  dans la boucle `v-for` existante (lignes ~206-226) sans casser le layout.

## 8. Ce qui NE change PAS

- `src/assets/utils/workspaceCrypto.ts`, `webhookCrypto.ts`, `useSecurePeer.ts`, `SearchSyncService.ts` : hors
  périmètre, ne pas toucher.
- Le flux `local`/`custom` (LLM local WebGPU, `LocalLLMService.ts`) : hors périmètre, déjà purement client-side
  (jamais de contenu envoyé à un serveur), rien à changer.
- Providers `openai`/`mistral`/`gemini` (`sfetch('/api/orgs/${orgId}/ai/chat', ...)`) : hors périmètre, cf. §1.

## 9. Perte d'accès / UX de récupération

Si la clé privée RSA de l'utilisateur est perdue (PIN oublié, pas de sauvegarde), il perd l'accès à
l'historique IA chiffré — exactement le même compromis que pour les threads/espaces déjà E2EE dans ce repo.
Ne pas inventer un mécanisme de récupération spécifique à l'IA ; si un mécanisme de récupération existe déjà
pour la clé privée RSA générale (sauvegarde, réinitialisation admin, etc.), il couvre automatiquement ce cas
aussi. Vérifier qu'aucun message d'erreur nouveau introduit par ce plan ne laisse l'utilisateur bloqué sans
indication (réutiliser le message `[🔒 Conversation chiffrée. Clé privée manquante.]` existant comme modèle).

## 10. Tests à écrire

- Vecteur de test cryptographique du §2 (round-trip + comparaison avec la valeur `wire_value` fixe).
- `loadSession()` : un test par branche (legacy plain, legacy E2EE enveloppe, nouveau gateway-aes-gcm-v1),
  avec des fixtures représentant chaque forme de `session.messages`.
- `ensureAiSessionKey()` : test du chemin bootstrap (404 → génération → POST) et du chemin normal (trouvé →
  déchiffrement → cache).
- `AISettings.vue` : test que la sauvegarde est bloquée si le provisionnement de clé échoue.
