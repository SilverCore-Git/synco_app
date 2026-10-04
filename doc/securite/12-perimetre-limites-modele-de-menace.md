# 12 — Périmètre, limites et modèle de menace

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Objet** | Ce que le chiffrement de Synco protège, ce qu'il ne protège pas, et les écarts entre la promesse affichée et la réalité du code |

---

## 1. Modèle de menace — synthèse

| Adversaire | Messages de salon | DM | Fichiers d'espace | Fichiers hors espace | Appels | Tâches / Agenda | Sessions éphémères |
|---|---|---|---|---|---|---|---|
| **Écoute réseau passive** | ✅ Protégé | ✅ | ✅ | ✅ (TLS) | ✅ | ✅ (TLS) | ✅ |
| **Vol de dump / sauvegarde SQL** | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a |
| **Vol du disque de stockage** | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a |
| **Admin infra Synco (accès `.env`)** | ✅ **Protégé** | ✅ | ✅ | ❌ **Exposé** | ✅ | ❌ **Exposé** | ✅ |
| **Compromission applicative de `synco_api`** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Serveur servant un client JS modifié** | ❌ **Exposé** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Réquisition judiciaire (contenu)** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Réquisition judiciaire (métadonnées)** | ❌ **Exposé** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ partiel |
| **Ancien membre ayant conservé une clé** | ❌ **Exposé** | ❌ | ❌ | n/a | ⚠️ | n/a | ✅ |
| **Appareil de l'utilisateur compromis** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 2. Les limites structurelles

### 2.1 L'E2EE livré par le web

Synco est une application web. **Le serveur sert le JavaScript qui manipule les clés.** Un serveur malveillant peut livrer un client modifié qui exfiltre la clé privée au prochain déverrouillage.

C'est la limite fondamentale, commune à tout E2EE web (Proton, Tutanota, WhatsApp Web…). Elle est partiellement atténuée par :

- les **binaires Tauri (desktop)** et **Capacitor (mobile)**, où le code est empaqueté et signé, donc non remplaçable à chaud par le serveur ;
- l'absence de mécanisme de mise à jour silencieuse du code cryptographique dans ces binaires.

➡️ **Recommandation de communication : la garantie E2EE est nettement plus forte sur les applications desktop/mobile que dans le navigateur.** C'est un argument produit, pas seulement une nuance technique.

### 2.2 Absence totale de rotation de clé

**Aucune clé E2EE n'est jamais renouvelée** dans le code à cette date.

| Clé | Champ `version` ? | Rotation implémentée ? |
|---|---|---|
| `ThreadKey` | ❌ **Même pas de champ** | ❌ Non |
| `WorkspaceKey` | ✅ | ❌ Non (toujours v1) |
| `DMConversationKey` | ✅ | ❌ Non (toujours v1) |
| `AiSessionKey` | ✅ | ❌ Non (toujours v1) |
| `OrgKey` | ✅ | ❌ Non (modèle quasi inutilisé côté client) |
| Clés serveur (`PRISMA_FIELD_ENCRYPTION_KEY`…) | — | ❌ Non |

**Conséquences concrètes :**

1. **L'exclusion d'un salon, d'un espace ou d'une organisation est une révocation applicative, pas cryptographique.** Un ancien membre qui a conservé une copie locale de la `ThreadKey` ou de la `WorkspaceKey` peut déchiffrer **tout contenu futur** de ce salon/espace s'il parvient à en récupérer le ciphertext (sauvegarde, complice interne, accès résiduel).
2. `src/websocket/ws.ts` documente explicitement que la copie de clé d'un membre exclu **n'est pas garantie nettoyée** (audit `L4`). `src/routes/orgs.users.ts:121` supprime bien les `OrgKey` à l'exclusion — mais pas les `ThreadKey` ni les `WorkspaceKey`.
3. **Pas de confidentialité persistante** (*forward secrecy*) sur les contenus stockés : la compromission d'une clé privée RSA ouvre **rétroactivement tout l'historique** de l'utilisateur.

➡️ **C'est la lacune la plus importante de l'architecture cryptographique de Synco.** Une rotation au départ d'un membre (régénérer la clé, la redistribuer aux membres restants, conserver les anciennes versions en lecture) est le chantier prioritaire.

Les seules exceptions offrant une vraie forward secrecy : les **appels P2P** (ECDH éphémère par appel) et les **sessions éphémères** (paire RSA jetable par session).

### 2.3 Récupération de compte impossible

Pas de séquestre de clé, pas de clé de récupération d'organisation, pas de code de secours, pas de partage de secret entre administrateurs.

**Un PIN oublié = perte définitive de tout l'historique E2EE de l'utilisateur.** Le mécanisme de « réajout par un administrateur » (`needsReadd: true`) permet de retrouver l'accès aux salons **futurs**, mais les contenus chiffrés pour l'ancienne clé publique restent illisibles — sauf redistribution manuelle par un pair qui détient encore la clé.

C'est une propriété de sécurité correcte, mais c'est le **principal risque opérationnel** du produit. Un déploiement en entreprise doit le documenter explicitement auprès des utilisateurs.

### 2.4 Métadonnées non protégées

L'E2EE protège le **contenu**, jamais les **métadonnées**. Le serveur (et donc quiconque le compromet ou l'y contraint) connaît :

- **le graphe social complet** : qui parle à qui, dans quel salon, dans quelle organisation ;
- **la chronologie complète** : horodatage de chaque message, édition, réaction, appel, connexion ;
- **le volume** : nombre de messages, taille de chaque fichier, nombre d'index de recherche par salon ;
- **les réactions emoji** : en clair, non chiffrées du tout ;
- **les mentions** : les jetons `<@:id>` sont extraits et envoyés en clair (`MessageReference`) ;
- **les types MIME et tailles de fichiers** ;
- **tout l'agenda** : horaires, durées, récurrences, participants ;
- **la présence** : qui est en ligne, quand, sur quel appareil.

Une analyse de trafic sur ces seules métadonnées est souvent aussi révélatrice que le contenu.

### 2.5 Dépendance au client en ligne pour la distribution de clés

La `ThreadKey` d'un nouveau membre est redistribuée **par un pair connecté** (`request-thread-keys` / `distribute-thread-keys`). Si aucun membre détenteur de la clé n'est en ligne, le nouveau membre reste bloqué.

Même logique pour la `WorkspaceKey` : son bootstrap nécessite qu'un administrateur ouvre l'espace.

## 3. Les dégradations silencieuses

Ce sont les points où le code **annonce** ou **laisse croire** à un chiffrement qui n'a pas lieu. Classés par gravité.

| # | Dégradation | Où | Signalé à l'utilisateur ? | Gravité |
|---|---|---|---|---|
| 1 | Salon vocal LiveKit **sans `ThreadKey`** → salle non E2EE | [`useLiveKit.ts`](../../src/composables/useLiveKit.ts) `unwrapRoomKey` | ❌ **Non** | 🔴 Élevée |
| 2 | ~~Upload de fichier : repli SSE si le chiffrement échoue~~ — **corrigé (01/10/2026)** : sans clé, l'envoi échoue, aucun fichier n'est stocké en clair | [`chunkedUpload.ts`](../../src/services/transfers/chunkedUpload.ts) | — | — |
| 3 | ~~Fichiers en salon d'accueil d'organisation jamais E2EE~~ — **corrigé (01/10/2026)** : chiffrés avec la `ThreadKey` du salon | [`fileKeys.ts`](../../src/assets/utils/fileKeys.ts) | — | — |
| 4 | Appels P2P **sans Insertable Streams** (Safari, Firefox) → surchiffrement désactivé | [`useSecurePeer.ts`](../../src/composables/useSecurePeer.ts) `setupMediaEncryption` | ❌ Non (`console.warn` seul) | 🟠 Moyenne |
| 5 | `DMMessage.isE2EE = false` → contenu affiché en clair | [`ChatView.vue`](../../src/views/OrgSpace/views/ChatView.vue) | ❌ **Non** | 🟠 Moyenne |
| 6 | ~~OnlyOffice désactive définitivement l'E2EE du fichier~~ — **supprimé (01/10/2026)** avec OnlyOffice | — | — | — |
| 7 | Session IA `local`/`custom` : `catch` laissant le payload en clair | [`AIService.ts`](../../src/services/AIService.ts) `syncSession` | ❌ Non | 🟡 Faible |
| 8 | Webhook actif sur un salon → messages lisibles par le serveur | `Message.isWebhook` | ❌ Non | 🟡 Faible |

### Recommandation transversale

**Ajouter un indicateur de chiffrement persistant par contexte** (salon, appel, fichier), sur le modèle de ce que font déjà les appels P2P (icône bouclier + empreinte) et les sessions éphémères. Aujourd'hui, un utilisateur ne peut pas savoir si la conversation qu'il a sous les yeux est réellement E2EE.

## 4. Fuites en clair en base

| Donnée | Modèle | Raison |
|---|---|---|
| **Réactions emoji** | `MessageReaction.emoji`, `DMMessageReaction.emoji` | Pas d'annotation `@encrypted` |
| **Noms de tags** | `Tag.name`, `Tag.color` | Contrainte `@@unique` incompatible avec un chiffrement non déterministe |
| **Payload brut de webhook** | `WebhookMessage.rawPayload` (`Json`) | `prisma-field-encryption` ne couvre pas les `Json` |
| **Appel d'outil IA en attente** | `AiChatSession.pendingToolCall` (`Json`) | Idem |
| **Métadonnées de notification** | `Notification.data`, `metadata` (`Json`) | Idem |
| **Embeds de message** | `Message.embeds` (`Json`) | Idem |
| **Jeton de flux `.ics`** | `AgendaFeedToken.token` | Contrainte `@unique` |
| **Secret HMAC de webhook** | `Webhook.secret` | Pas d'annotation |
| **Tout l'agenda hors titre/description/lieu** | `CalendarEvent.*` | Nécessaire aux requêtes par plage de dates |
| **Tous les champs de filtre des tâches** | `Task.status`, `dueDate`, assignations | Nécessaire aux filtres Kanban |

➡️ **Règle à retenir pour l'équipe : tout champ `Json` échappe au chiffrement en base.** À vérifier systématiquement à chaque ajout de modèle.

## 5. Points d'exposition vers des tiers

| Tiers | Ce qu'il reçoit | Évitable ? |
|---|---|---|
| **Apple (APNS) / Google (FCM)** | Nom de l'expéditeur, nom de l'espace, avatar. **Jamais le contenu.** | Partiellement (notifications silencieuses) |
| **`ui-avatars.com`** | **Le nom des utilisateurs Synco**, dans l'URL de l'avatar de repli | ✅ **Oui** — générateur local ou `data:` URI |
| **STUN Google** (`stun.l.google.com`) | Adresses IP des participants aux appels | ✅ Oui — STUN auto-hébergé |
| **OpenAI / Mistral / Google** (si ces fournisseurs sont choisis) | **Tout le contenu des conversations IA** | ✅ Oui — mode `gateway` ou `local` |
| **Google Calendar** (si connecté) | Titres, descriptions, lieux, participants des événements synchronisés | ✅ Oui — ne pas connecter |
| **Keycloak** | Identités, authentification | ❌ Non (composant d'infrastructure) |

Les deux premières lignes sont des corrections rapides et à fort rapport bénéfice/coût pour une plateforme se présentant comme souveraine.

## 6. Qualité de l'implémentation cryptographique

### ✅ Points forts

- **Aucune cryptographie maison.** WebCrypto côté client, `node:crypto` côté serveur, `aes_gcm` (RustCrypto) côté passerelle.
- **Choix d'algorithmes conformes à l'état de l'art** : RSA-OAEP 4096, AES-256-GCM, ECDH P-256, HKDF-SHA256, PBKDF2 à compteur élevé.
- **IV toujours aléatoires, jamais réutilisés.** Le code va jusqu'à générer un IV dédié pour le scellement de clé de fichier, avec une justification écrite.
- **Comparaisons en temps constant** (`timingSafeEqual`) partout où un secret est comparé.
- **Clé privée non extractible** après import (`extractable = false`).
- **Clés en mémoire uniquement**, jamais en `localStorage`.
- **Principe « échouer au démarrage plutôt que dégrader »** appliqué à toutes les clés maîtres serveur.
- **AAD liant chaque champ IA à sa position** — protection rare contre le réarrangement de contenu.
- **TOFU sur les clés publiques** avec blocage d'envoi et empreinte vérifiable.
- **Compatibilité ascendante gérée par détection de tag GCM**, pas par un marqueur falsifiable.
- **Un `Debug` Rust qui masque la clé de session** — attention au détail qui évite une fuite par journal.
- **Purge explicite des Blob URL** à la fermeture d'une session éphémère.
- **Code abondamment commenté sur le « pourquoi »**, y compris sur ses propres limites — qualité rare et qui a considérablement facilité cet audit documentaire.

### ⚠️ Points d'attention

1. **Aucune rotation de clé, nulle part** (§2.2) — priorité n°1.
2. **Dégradations silencieuses non signalées à l'utilisateur** (§3) — priorité n°2.
3. **Incohérence de nommage `nonce`/`iv`** entre `Message` (IV dans `iv`) et `DMMessage` (IV dans `nonce`) — source d'erreur pour toute reprise du code.
4. **Champs `Json` hors périmètre de chiffrement** (§4).
5. **Le vocabulaire « E2EE » est employé pour les webhooks** alors que le serveur déchiffre — à corriger dans les commentaires et la documentation.
6. **Couverture de tests cryptographiques limitée** : seul le module IA en dispose. Aucun test sur `ThreadKey`, `WorkspaceKey`, `DMConversationKey`, ni sur `FileCrypto`.
7. **Webhooks legacy à régénérer** (clé publique = clé privée, audit `H4`).
8. **Secrets potentiellement compromis via l'historique Git** avant nettoyage (audit du 10/09/2026) — à rotationner si ce n'est pas déjà fait.

## 7. Chantiers recommandés, par priorité

| Priorité | Chantier | Justification |
|---|---|---|
| 🔴 1 | **Rotation de `ThreadKey`/`WorkspaceKey` à la sortie d'un membre** | Seule façon de rendre la révocation d'accès réelle. Ajouter un champ `version` à `ThreadKey`. |
| 🔴 2 | **Indicateur de chiffrement visible par contexte** | L'utilisateur ne peut pas distinguer un salon E2EE d'un salon dégradé. |
| 🔴 3 | **Faire échouer l'upload plutôt que se replier en clair** | Dégradation silencieuse sur une action explicite de l'utilisateur. |
| 🟠 4 | **Avertir quand un salon vocal n'est pas E2EE** | Notamment à l'arrivée d'un invité sans `ThreadKey`. |
| 🟠 5 | **E2EE des fichiers en salon d'accueil d'organisation** | Utiliser `OrgKey`, déjà présent au schéma mais inutilisé. |
| 🟠 6 | **Chiffrer `rawPayload` et `pendingToolCall`** | Passer ces `Json` en `String` JSON-sérialisé + `@encrypted`, comme `AiChatSession.messages`. |
| 🟡 7 | **Supprimer la dépendance à `ui-avatars.com`** | Fuite de noms d'utilisateurs vers un tiers. |
| 🟡 8 | **Tests automatisés sur les primitives non-IA** | `FileCrypto`, `ThreadKey`, `DMConversationKey`. |
| 🟡 9 | **Chiffrer les réactions emoji** | Fuite de signal social sur du contenu E2EE. |
| 🟡 10 | **Mode « confidentialité renforcée » pour tâches/agenda** | E2EE en échange de la désactivation des intégrations externes (§9 de la fiche [09](./09-taches-agenda-calendrier.md)). |
| ⚪ 11 | **STUN auto-hébergé** | Retirer Google du chemin de la découverte NAT. |
| ⚪ 12 | **Rotation des clés maîtres serveur** | Utiliser `PRISMA_FIELD_DECRYPTION_KEYS`, déjà supporté par la bibliothèque. |

## 8. Ce qu'il est honnête d'affirmer publiquement

Sur la base de l'état du code au 28 septembre 2026 :

✅ **Affirmations exactes**
- « Les messages de vos salons et vos messages privés sont chiffrés de bout en bout. »
- « Les fichiers de vos espaces de travail sont chiffrés de bout en bout. »
- « Vos appels privés sont chiffrés de bout en bout, en pair-à-pair, sans relais tiers. »
- « Vos sessions éphémères ne laissent aucune trace sur nos serveurs. »
- « Toutes vos données sont chiffrées au repos dans notre base de données. »
- « Nous ne pouvons pas lire le contenu de vos messages. »
- « Votre recherche fonctionne sans que nous puissions lire votre index. »

⚠️ **Affirmations à nuancer**
- « Vos appels de groupe sont chiffrés de bout en bout » → **seulement si tous les participants possèdent la clé du salon** ; un invité par lien dégrade l'appel.
- « Synco est chiffré de bout en bout » (affirmation globale, telle qu'elle figure dans `synco_app/doc/index.md`) → **les tâches et l'agenda ne le sont pas.**

❌ **Affirmations à éviter**
- « Vos tâches et votre agenda sont chiffrés de bout en bout. » — **faux.**
- « Retirer quelqu'un d'un salon lui coupe l'accès cryptographiquement. » — **faux**, pas de rotation de clé.
- « Nous ne savons rien de votre activité. » — **faux**, toutes les métadonnées sont visibles.
- « Vos conversations avec l'IA sont privées. » — **dépend entièrement du fournisseur configuré.**

---

## Références croisées

- Campagnes d'audit : [`audits/`](../../../synco_api/audits/) — 10/09, 11/09 (`C*`/`H*`/`M*`/`L*`), 14/09 (`N*`), 20/09 (`P*`)
- Documentation utilisateur : [`synco_app/doc/index.md`](../index.md)
- Tests de non-régression sécurité : [`src/security/pentest-2026-09-20.static.test.ts`](../../../synco_api/src/security/pentest-2026-09-20.static.test.ts)
