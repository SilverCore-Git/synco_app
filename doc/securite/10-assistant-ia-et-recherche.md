# 10 — Assistant IA et recherche sémantique

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`synco_app/src/services/AIService.ts`](../../src/services/AIService.ts), [`synco_app/src/services/AiSessionKeyService.ts`](../../src/services/AiSessionKeyService.ts), [`synco_app/src/services/SearchSyncService.ts`](../../src/services/SearchSyncService.ts), [`src/routes/aiSessionKey.ts`](../../../synco_api/src/routes/aiSessionKey.ts), [`src/services/aiChatSessionsService.ts`](../../../synco_api/src/services/aiChatSessionsService.ts), [`Synco_AI_Gateway/src/crypto.rs`](../../../Synco_AI_Gateway/src/crypto.rs) |
| **Modèles Prisma** | `AiChatSession`, `AiSessionKey`, `EncryptedSearchIndex` |
| **Statut** | ⚠️ **Variable selon le fournisseur d'IA choisi** |

---

## 1. Six fournisseurs, trois régimes de confidentialité

`AIProviderConfig.provider` accepte : `local`, `gateway`, `openai`, `gemini`, `mistral`, `custom`.

| Fournisseur | Où tourne l'inférence | Contenu visible par `synco_api` | Contenu visible par un tiers | E2EE en base |
|---|---|---|---|---|
| **`local`** | Dans le navigateur (WebLLM) | ❌ Non | ❌ Non | ✅ Oui (enveloppe RSA auto-chiffrée) |
| **`gateway`** | Votre Ollama, via la passerelle Rust auto-hébergée | ❌ **Non** | ❌ Non (si vous hébergez la passerelle) | ✅ Oui (`gcm1:` sous `AiSessionKey`) |
| **`custom`** | Endpoint compatible OpenAI de votre choix | ❌ Non (boucle client) | ⚠️ Oui — l'endpoint configuré | ✅ Oui (enveloppe RSA auto-chiffrée) |
| **`openai`** | OpenAI | ✅ **Oui** | ✅ **Oui** (OpenAI) | ❌ **Non** |
| **`mistral`** | Mistral AI | ✅ **Oui** | ✅ **Oui** (Mistral) | ❌ **Non** |
| **`gemini`** | Google | ✅ **Oui** | ✅ **Oui** (Google) | ❌ **Non** |

**Le choix du fournisseur détermine entièrement le niveau de confidentialité de l'assistant IA.** C'est une décision de configuration d'organisation (`activeModules.aiConfig`), pas un réglage de sécurité, et rien dans l'interface ne la présente comme telle.

### Pourquoi les fournisseurs SaaS cassent l'E2EE

`openai` / `mistral` / `gemini` utilisent la **boucle d'agent côté serveur** (`AiChatSession.status`, `pendingToolCall`) : c'est `synco_api` qui appelle le fournisseur, orchestre les appels d'outils et écrit les messages. Il manipule donc nécessairement le contenu en clair. Impossible de faire autrement sans déporter la boucle dans le navigateur.

## 2. Le mode `gateway` — l'architecture E2EE complète

C'est le mode conçu pour la confidentialité maximale avec une IA utile.

```
   Navigateur ──── X-Session-Key: <clé AES brute> ────▶ Synco AI Gateway (Rust, auto-hébergée)
       │                    + champs chiffrés "gcm1:"          │
       │                                                       ├──▶ Ollama (votre infra)
       │                                                       │
       │                                                       └──▶ synco_api
       │                                                            (persistance + exécution
       │                                                             des outils métier)
       └── AiSessionKey (RSA-OAEP) ◀── synco_api
```

### La clé : `AiSessionKey`

- **Une clé AES-256 par organisation**, distribuée à chaque membre scellée avec sa clé publique RSA-OAEP.
- Forme calquée sur `OrgKey` : granularité `orgId + userId + version`.
- **`synco_api` ne voit jamais la clé en clair** — il ne stocke que l'enveloppe RSA.
- Côté client, elle vit **en mémoire uniquement** (`Map` dans `AiSessionKeyService.ts`), jamais en `localStorage` — même convention que `privateKey`.

Bootstrap : au premier usage du mode `gateway`, `GET /api/orgs/:orgId/ai/key` renvoie 404, le client génère une clé, se l'enveloppe à lui-même et la poste. Le partage à un nouveau membre se fait via `targetUserId` sur la même route (le client rescelle la clé pour la clé publique du destinataire).

Un `Map<orgId, Promise>` (`pending`) évite les bootstraps concurrents.

### Le format de fil `gcm1:`

Défini dans `E2EE_PLAN.md §2` et implémenté **à l'identique** dans les trois dépôts (`synco_app`, `synco_api`, `Synco_AI_Gateway`) :

```
"gcm1:" + base64standard( nonce(12) ‖ ciphertext ‖ tag(16) )

AAD = "{sessionId}:{messageId}:{fieldName}"
```

L'**AAD (donnée authentifiée additionnelle)** est le point le plus intéressant : elle lie cryptographiquement chaque valeur chiffrée à sa **position exacte**. Il devient impossible de déplacer un champ chiffré d'un message à un autre, d'une session à une autre, ou d'un champ `content` vers un champ `toolResult` — l'authentification GCM échouerait.

C'est une protection contre le **réarrangement de contenu par le serveur**, rarement implémentée.

### Transmission de la clé à la passerelle

La clé AES brute est envoyée à **chaque requête** dans l'en-tête `X-Session-Key` (base64 de 32 octets).

```rust
/// Clé AES-256 brute, transmise par le navigateur à chaque requête via le header
/// `X-Session-Key`. Jamais persistée, jamais logguée — `Debug` masque volontairement la valeur.
#[derive(Clone, Copy)]
pub struct SessionKey([u8; 32]);

impl std::fmt::Debug for SessionKey {
    fn fmt(&self, f) -> … { write!(f, "SessionKey(***)") }
}
```

Le type Rust **masque sa propre valeur dans `Debug`** : la clé ne peut pas fuiter accidentellement dans un `println!`, un `tracing::debug!` ou un panic.

➡️ **La passerelle voit donc le contenu en clair** — c'est nécessaire, elle doit le transmettre à Ollama. La propriété de sécurité repose sur le fait que **vous hébergez la passerelle**. Ce n'est pas de l'E2EE au sens strict (le contenu est déchiffré en transit chez un tiers de confiance), mais de l'E2EE **vis-à-vis de Synco** : `synco_api` ne voit jamais rien.

### Comportement en échec (fail-closed)

```rust
/// Fail-closed : toute erreur de format doit se traduire par un 400 côté appelant, jamais par un
/// retour silencieux vers un mode "session en clair" (E2EE_PLAN.md §3).
```

Header absent, base64 invalide, mauvaise longueur, préfixe de version inconnu, tag GCM invalide → **400**, jamais de repli en clair.

### Garde-fou anti-downgrade

`AiChatSession.encryptionScheme` (`'gateway-aes-gcm-v1'`), une fois posé, **ne peut plus être effacé ni modifié** : `PATCH /:sessionId` refuse le changement. Cela empêche un serveur compromis de faire redescendre une session chiffrée vers du clair.

> Subtilité documentée : `synco_app` ne s'appuie **plus** sur ce marqueur pour décider quoi déchiffrer (il utilise `hasEncryptedGatewayFields`, une détection sur le contenu réel). Le marqueur reste utile pour le garde-fou côté serveur, mais son absence sur une session ancienne ne casse rien.

### Séparation des responsabilités

Point important du modèle : **la passerelle n'a jamais d'accès direct à une base de données**. Toute la logique métier et toutes les permissions restent dans `synco_api` :

- elle relaie le **même jeton Keycloak** que le navigateur utilise déjà — aucune clé à distribuer, et c'est `synco_api` qui authentifie réellement chaque appel ;
- l'exécution d'un outil (« crée une tâche ») passe par `POST /api/orgs/:orgId/ai/tools/:name/execute` sur `synco_api` ;
- la passerelle est **sans état et sans configuration par organisation** — un seul déploiement sert n'importe quelle organisation qui le pointe.

➡️ Corollaire de sécurité : une passerelle compromise **ne peut pas outrepasser les permissions** de l'utilisateur dont elle relaie le jeton. Elle peut en revanche lire tout le contenu des sessions qui transitent par elle.

## 3. Mode `local` / `custom` — enveloppe RSA auto-chiffrée (legacy)

Pour les modes pilotés par le client, `syncSession()` chiffre tout l'historique avec `encryptForPeer()`, **en se scellant à soi-même** :

```ts
const encrypted = await encryptForPeer(
    JSON.stringify(aiSessionMessages.value),
    user.value.publicKey,      // destinataire = moi
    user.value.publicKey       // self        = moi
);
payloadMessages = { isE2EE: true, ciphertext, encryptedAesKey, iv };
```

Une session IA n'ayant qu'un seul lecteur légitime, s'auto-chiffrer suffit. ⚠️ **Conséquence : une session IA `local`/`custom` n'est lisible que par son auteur, et devient définitivement illisible après une réinitialisation de PIN** (nouvelle paire RSA — voir fiche [01](./01-fondations-cryptographiques.md) §2.5).

⚠️ Le chiffrement est conditionné à `if (user.value?.publicKey && privateKey.value)`, avec un `catch` qui laisse `payloadMessages` en clair en cas d'échec. **Repli silencieux possible.**

## 4. Affichage dégradé

Quand la clé manque, l'interface affiche des marqueurs explicites plutôt que d'échouer :

| Contexte | Affichage |
|---|---|
| Titre de session non déchiffrable | `🔒 Titre chiffré` |
| Corps de session non déchiffrable | `[🔒 Conversation chiffrée. Clé privée manquante.]` |
| PIN non déverrouillé | `🔒 Déverrouillez votre sécurité (code PIN) pour accéder à l'IA.` |

Bonne pratique : l'utilisateur comprend qu'il manque une clé, et n'interprète pas l'absence de contenu comme une perte de données.

## 5. Recherche sémantique — `EncryptedSearchIndex`

C'est le module le plus élégant de l'architecture de sécurité Synco : **une recherche plein texte et sémantique qui fonctionne sans que le serveur puisse lire l'index**.

### Principe

```
[CLIENT] extraction du texte + calcul de l'embedding (vecteur) — localement
   │
   ├─ blob = JSON({ textContent, vector })
   ├─ iv   = 12 octets aléatoires
   ├─ encryptedBlob = AES-GCM(ThreadKey du salon, iv, blob)
   ▼
POST → EncryptedSearchIndex { workspaceId, threadId, type, resourceId, encryptedBlob, iv }
```

À la recherche, **tout se passe côté client** :

```
GET /api/search-index/workspace/:spaceId
   → { indexes, threadKeys }
   │
   ├─ déchiffrement de chaque ThreadKey avec la clé privée RSA
   ├─ déchiffrement de chaque encryptedBlob avec la ThreadKey du salon correspondant
   └─ recherche textuelle / similarité cosinus, en mémoire, dans le navigateur
```

Un index dont la `ThreadKey` n'est pas déchiffrable est simplement **ignoré** (`if (!aesKey) continue;`) : le contrôle d'accès est **cryptographique**, pas applicatif. Un utilisateur ne peut pas rechercher dans un salon dont il n'a pas la clé, même si le serveur lui envoyait tous les index.

### Ce que le serveur sait quand même

| Donnée | Chiffrée ? |
|---|---|
| `encryptedBlob` (texte + vecteur) | ✅ E2EE sous `ThreadKey` |
| `type` (MESSAGE / FILE / TODO) | ✅ chiffré en base, ❌ pas E2EE |
| `resourceId` | ✅ chiffré en base, ❌ pas E2EE |
| `workspaceId`, `threadId`, `userId` | ❌ **en clair** |
| `createdAt`, `updatedAt` | ❌ **en clair** |
| **Nombre d'index par salon** | ❌ **en clair** — révèle le volume d'activité |

### Limite de passage à l'échelle

Le client télécharge et déchiffre **tous** les index d'un espace à chaque recherche. C'est le prix de l'E2EE sur la recherche, mais cela devient coûteux sur un espace très actif. Aucune pagination n'est appliquée dans `restoreWorkspaceIndexes`.

### Le vecteur d'embedding

Le vecteur est chiffré avec le texte, donc le serveur ne peut pas faire de recherche sémantique — ce qui est bien l'objectif. ⚠️ En revanche, un vecteur d'embedding **fuit sémantiquement** s'il est un jour exposé : des techniques d'inversion permettent de reconstruire partiellement le texte source. Le fait qu'il soit chiffré au même niveau que le texte lui-même est donc le bon choix.

## 6. `AiChatSession` — inventaire

| Champ | Chiffré en base ? | E2EE ? |
|---|---|---|
| `title` | ✅ | ✅ en mode `gateway` (`gcm1:`), ❌ sinon |
| `messages` | ✅ | ✅ en mode `gateway`/`local`/`custom`, ❌ pour les fournisseurs SaaS |
| `status` | ❌ | ❌ |
| `pendingToolCall` (`Json`) | ❌ **Non** — `prisma-field-encryption` ne chiffre pas les `Json` | ❌ |
| `encryptionScheme` | ❌ | ❌ |
| `userId`, `orgId`, horodatages | ❌ | ❌ |

⚠️ **`pendingToolCall` est en clair en base** : il porte le nom de l'outil et ses arguments en attente de confirmation. Pour une session `gateway` par ailleurs entièrement chiffrée, c'est une fuite résiduelle (le serveur voit « l'assistant s'apprête à créer une tâche intitulée X »).

## 7. Clé API du fournisseur

`Organization.aiApiKey` porte `/// @encrypted` : la clé OpenAI/Mistral/Gemini d'une organisation est chiffrée au repos, mais **déchiffrable par `synco_api`** (qui en a besoin pour appeler le fournisseur). Rien d'anormal, mais à mentionner dans une analyse de risque.

## 8. Contrôle d'accès du module IA

`checkOrgMember` sur `/api/orgs/:orgId/ai/*` vérifie deux choses :
1. l'appelant est bien membre de l'organisation ;
2. la fonctionnalité `ai` figure dans `Organization.features` (contrôle d'abonnement).

Une couverture de tests dédiée existe : [`src/routes/aiSessionsE2ee.test.ts`](../../../synco_api/src/routes/aiSessionsE2ee.test.ts), [`src/services/aiChatSessionsService.test.ts`](../../../synco_api/src/services/aiChatSessionsService.test.ts), [`synco_app/src/assets/utils/crypto.aiSession.test.ts`](../../src/assets/utils/crypto.aiSession.test.ts), [`synco_app/src/services/AIService.loadSession.test.ts`](../../src/services/AIService.loadSession.test.ts). C'est le seul pan cryptographique du produit doté de tests automatisés à cette date.
