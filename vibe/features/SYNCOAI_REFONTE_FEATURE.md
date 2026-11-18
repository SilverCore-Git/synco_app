# Refonte Synco AI — Synco AI Runtime (côté synco_app)

> **Formats et protocoles** : la référence est `synco_ai_runtime/docs/plan/` (dépôt public, branche
> `feature/syncoai-refonte`). Ce document ne les recopie pas : il décrit ce qui change **dans
> synco_app** (services, utilitaires, vues, composants). En cas d'écart, `docs/plan/` fait foi.
> Plan de projet : `.claude/prompts/syncoai_refonte/` (lots L01 pour la référence TS, L10 à L13).

## 1. Ce qui change pour l'utilisateur

- Un admin appaire le **Synco AI Runtime** de l'org dans *Paramètres de l'org → Synco AI → Runtime*
  (URL + code d'appairage affiché par le runtime). Il règle la politique : membres autorisés
  (sélecteur cherchable), durée maximale de délégation (D4), politique de confirmation (D5).
- Un membre active son « mode runtime » : son app délègue au runtime les clés de l'org qu'il détient
  (jamais l'AK, ses clés d'identité, ses DM).
- Une conversation peut être basculée « sur le runtime » : elle continue quand Synco est fermé ;
  l'app redevient une fenêtre qui affiche l'historique et le flux en direct, et permet de répondre,
  confirmer, annuler. Retour en local possible à tout moment.
- Les conversations apparaissent dans un **dock Synco AI** (colonne bas-droite d'`App.vue`, modèle
  `TaskPanelDock.vue` et `TransfersPanel.vue`, P13).

## 2. Cryptographie côté client

### 2.1 Fonctions pures (référence TS, écrites par L01 avec les vecteurs)

Dans `src/assets/utils/` (noms indicatifs), sans Vue, réseau ni stockage, comme `e2eeV4.ts` :

| Fichier | Contenu | Spec |
|---|---|---|
| `runtimeCert.ts` | empreinte, code d'appairage (format de `formatLinkSecret`), URL canonique, octets du certificat, signature / vérification ECDSA, transcript et vérification du défi de possession | 01 |
| `runtimeDelegation.ts` | enveloppe de tête `srd1`, mandat, entrées `sre1`, enveloppe `rt1` (vérification) | 03 |

Champs de conversation : `encryptAiField` / `decryptAiField` existants (`crypto.ts:952-1003`) avec
la clé de conversation `CK` ; format `gcm1:` **inchangé**, AAD `sessionId:messageId:fieldName`
(séparateur `:`).

### 2.2 Service de délégation (L10, sans UI) — `src/services/aiRuntime/`

- **Appairage (admin)** : `GET <url>/v1/identity` en direct, comparaison au code, défi `pair`,
  signature du certificat avec `privateSignKey`, dépôt `POST /api/orgs/:orgId/ai/runtime`, épinglage.
- **Vérification (membre)** : certificat signé par un admin selon l'API, signature `trusted` via
  `verifyWithSignKeys` (`keyTrust.ts:294`), clés servies par le runtime = certificat, épinglage TOFU,
  défi `delegate` (`docs/plan/01 §6.3`). Tout échec bloque la délégation, avec un code
  (`runtime_key_changed`, `cert_bad_signature`, `challenge_failed`…).
- **Épinglage TOFU** : `idb-keyval`, clé `rt-pin:<utilisateur>:<orgId>` (`docs/plan/01 §8`) ; jamais
  effacé sur la seule parole de l'API ; changement = refus + alerte, acceptation explicite seulement.
- **Délégation** : ouverture locale des `ThreadKey` et `WorkspaceKey` (toutes versions) de l'org,
  `CK` des conversations runtime ; enveloppe, entrées, mandat ; dépôt. `DK` gardée en mémoire (clé
  non extractable), effacée au verrouillage (`registerKeyCache`).
- **Synchro P11** : à l'ouverture (déverrouillée) et toutes les 6 h, en tâche de fond, jamais
  bloquante ; renouvellement si moins de 50 % de la durée reste ; en temps réel sur `thread:created`
  et les créations / rotations de clé d'espace ; regroupement 5 s, backoff, plafond
  (`docs/plan/03 §7.2`, `09 §4`).
- **Révocation** par l'utilisateur ; effacement de `DK`.
- Aucune clé dans un état réactif Vue, un journal, un message d'erreur ; `Uint8Array` effacés après
  usage.

### 2.3 Clé de conversation et bascule (L10/L11)

- Nouveau contexte `KeyContext` : `aiconv:${string}` (`keyPinning.ts:22`).
- Bascule local → runtime : génération de `CK`, scellé RSA-OAEP pour soi + enveloppe FC4,
  réécriture de l'historique sous `CK` selon son schéma d'origine (`docs/plan/03 §6.4`), entrée
  `conv`, puis `POST …/switch-to-runtime` en une requête.
- Lecture : `encryptionScheme === "conv-gcm1-v1"` → `CK` (`GET …/sessions/:id/key`) ; sinon détection
  existante (`hasEncryptedGatewayFields`, `AIService.ts:594`) et formats historiques. Une conversation
  `conv-gcm1-v1` revenue en local est poursuivie par la boucle navigateur, qui écrit le même format.

### 2.4 Clés créées par le runtime (`rt1`)

`verifyKeyEnvelopeIfPresent` (`keyEnvelope.ts:124`) gère un `creatorId` `rt1:<delegationId>` :
lecture du mandat (`GET …/runtime/delegations/:id/mandate`), vérification du certificat, du mandat
(clé de l'utilisateur), puis de l'enveloppe avec la clé `csk` du runtime (`docs/plan/03 §10`).
Affichage : « créé par Synco AI pour <nom> ». Les apps non mises à jour acceptent ces clés en TOFU
(comportement actuel pour un créateur inconnu).

## 3. Interface

| Écran / composant | Changement | Lot |
|---|---|---|
| `views/OrgSpace/views/settings/views/AISettings.vue`, `components/AiProviderCard.vue` | carte « Runtime » : appairage (URL + code), état (en ligne, empreinte groupée par 4), désappairage (`ConfirmDelete.vue`), politique (membres via dropdown cherchable, `maxDelegationDays`, `toolPolicy`) ; pour un membre : activer / révoquer son mode runtime, empreinte, signataire du certificat | L11 |
| `views/OrgSpace/views/OrgAI.vue`, `components/ai/AiComposerControls.vue` | « Faire tourner sur le runtime » / « Revenir en local », état de la délégation, erreurs expliquées (runtime hors ligne, clé changée, délégation expirée) | L11 |
| `services/AIService.ts` | source d'évènements derrière une interface commune (locale, API SSE, runtime WS) ; fin du régime `gateway` (la passerelle devient un fournisseur de la boucle locale avec ticket `sgt1`) ; `gatewayFetch` vers `/chat` retiré ; `assertAllowedGateway` et `listGatewayModels` gardés | L11, L12 |
| client WebSocket du runtime (nouveau, `services/aiRuntime/`) | ticket `srt1`, `hello`, reprise par `epoch`/`seq` ou `snapshot`, déchiffrement de chaque champ, file de messages, `confirm` / `answer` / `upload` / `cancel`, reconnexion avec backoff, mode dégradé par la boîte de réception de l'API (`docs/plan/05`) | L12 |
| `components/ai/ToolStepItem.vue`, `PendingActionBar.vue`, `ToolResultBody.vue`, `agentTypes.ts` | réutilisés tels quels ; statuts `queued`, `running`, `awaiting_*`, `failed`, `cancelled` (`docs/plan/08 §7`) | L12 |
| Dock Synco AI (nouveau, à côté de `views/OrgSpace/components/TaskPanel/TaskPanelDock.vue` et `components/overlay/TransfersPanel.vue`) | barre réduite par conversation (état), panneau déplié pour suivre et répondre, ouverture d'`OrgAI.vue` | L13 |
| Notifications push | un clic ouvre la conversation (`data: { orgId, sessionId }`), web, mobile, Tauri | L12 |

Règles maison : aucun `alert()` / `confirm()` / `prompt()` (confirmations par `ConfirmDelete.vue` et
les fenêtres de l'app), style visuel expressif existant, pas de commentaire HTML à la racine d'une
vue, listes de membres par dropdown cherchable (100 membres par org).

## 4. Compatibilité

- Anciennes conversations : `server` (clair), `client` (blob RSA `isE2EE`), `gateway`
  (`gcm1:` sous `AiSessionKey`) restent lisibles et continuables (règle des formats
  rétrocompatibles : lire l'ancien, écrire le nouveau).
- `AiSessionKey` reste utilisée pour lire les conversations `gateway` ; elle n'est jamais déléguée au
  runtime (`docs/plan/00 §6 Q1`).

## 5. Tests attendus

- Vecteurs L01 rejoués côté TS (`bun test`) ; sens Rust → TS (le TS ouvre ce que produit la crate).
- L10 : délégation refusée si certificat non signé par un admin épinglé, clé du runtime changée, ou
  défi échoué ; aucune charge envoyée ne contient l'AK ni une clé privée d'identité ; ni DM ni autre
  org délégués ; la synchro ne délègue que l'org concernée.
- L11 : chargement d'une ancienne session `gateway` (fixture), bascule aller-retour (services
  simulés), régime choisi selon le fournisseur.
- L12 : runtime simulé (WebSocket bouchon) : flux complet, reconnexion, message en file, confirmation,
  annulation.
- `vue-tsc` **via node** (`host-spawn`), en vérifiant qu'il lit bien les fichiers.

## 6. Recette manuelle (porte D, Firefox)

1. Appairer un runtime de test (URL + code) depuis un compte admin ; l'empreinte affichée = celle du
   dashboard du runtime.
2. Depuis un compte membre : activer le mode runtime ; vérifier l'écran de première vue (signataire,
   empreinte).
3. Basculer une conversation ; envoyer un message ; fermer l'onglet ; rouvrir plus tard : la
   conversation a continué, notification reçue.
4. Créer un salon depuis un autre compte pendant que le premier est hors ligne ; rouvrir le premier :
   la synchro P11 ajoute la clé, une conversation en `awaiting_key` repart.
5. Changer les clés du runtime (`reset-keys` + nouvel appairage) : l'app refuse, alerte, puis accepte
   seulement après action explicite.
6. Révoquer sa délégation ; désappairer : les conversations reviennent en local et restent lisibles.
