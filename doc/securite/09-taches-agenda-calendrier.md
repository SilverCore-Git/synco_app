# 09 — Tâches, agenda et calendrier

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`src/services/tasksService.ts`](../../../synco_api/src/services/tasksService.ts), [`src/services/externalCalendarService.ts`](../../../synco_api/src/services/externalCalendarService.ts), [`src/utils/googleCalendarCrypto.ts`](../../../synco_api/src/utils/googleCalendarCrypto.ts), [`src/services/agenda/feedTokenService.ts`](../../../synco_api/src/services/agenda/feedTokenService.ts), [`src/routes/agendaFeed.ts`](../../../synco_api/src/routes/agendaFeed.ts) |
| **Modèles Prisma** | `Task`, `TodoList`, `Tag`, `TaskOrder`, `TaskFileLink`, `CalendarEvent`, `EventAttendee`, `EventReminder`, `CalendarAccessGrant`, `ExternalCalendarConnection`, `AgendaFeedToken` |
| **Statut** | ❌ **PAS de chiffrement de bout en bout** — chiffrement au repos uniquement |

---

## 1. Constat principal

> **Ni le module Tâches (Todo/Kanban) ni le module Agenda ne sont chiffrés de bout en bout.**

Leurs contenus (`title`, `description`, `location`) sont protégés **uniquement** par la couche `prisma-field-encryption` — c'est-à-dire par une clé que `synco_api` détient. Un administrateur d'infrastructure Synco, ou un attaquant ayant compromis le processus applicatif, peut lire l'intégralité des tâches et des événements d'agenda de toutes les organisations.

C'est un écart net avec la messagerie et les fichiers d'espace. Cette section documente précisément l'étendue et les raisons de cet écart.

## 2. Pourquoi ces modules ne sont pas E2EE

Ce n'est pas un oubli, mais une conséquence directe de fonctionnalités qui exigent que **le serveur comprenne le contenu** :

| Fonctionnalité | Exigence serveur incompatible avec l'E2EE |
|---|---|
| Rappels d'échéance / notifications programmées | Le serveur doit évaluer `dueDate` et déclencher un envoi, hors ligne du client |
| Vue Kanban filtrée, tri, pagination | Filtres SQL sur `status`, `archived`, `spaceId`, assignations |
| Requêtes de plage de dates de l'agenda | `WHERE startAt BETWEEN … AND …` — impossible sur du chiffré non déterministe |
| Expansion des séries récurrentes | Le serveur calcule les occurrences à partir de `recurrenceRule` |
| Synchronisation Google Calendar / ICS | Le service externe reçoit et renvoie du **clair** par définition |
| Export de flux `.ics` | Un client de calendrier tiers ne sait pas déchiffrer |
| Outils IA côté serveur (« crée une tâche… ») | La boucle d'agent serveur manipule le contenu |

L'E2EE et ces fonctionnalités sont **mutuellement exclusifs** en l'état de l'architecture. Il s'agit d'un arbitrage produit assumé, pas d'une faille — mais il doit être communiqué clairement, car la documentation utilisateur présente Synco globalement comme « chiffré de bout en bout ».

## 3. Module Tâches — inventaire détaillé

| Donnée | Chiffrée en base ? | E2EE ? |
|---|---|---|
| `Task.title` | ✅ | ❌ |
| `Task.description` | ✅ | ❌ |
| `Task.status` (TODO / IN_PROGRESS / DONE) | ❌ | ❌ |
| `Task.statusChangedAt`, `dueDate` | ❌ | ❌ |
| `Task.archived`, `archivedAt` | ❌ | ❌ |
| `Task.creatorId`, assignés (`assignees`) | ❌ | ❌ |
| `Task.spaceId`, `organizationId`, `todoListId`, `parentTaskId` | ❌ | ❌ |
| `TodoList.title`, `TodoList.description` | ✅ | ❌ |
| `Tag.name`, `Tag.color` | ❌ **Non — en clair** | ❌ |
| `TaskOrder` (position dans le Kanban) | ❌ | ❌ |
| `TaskFileLink` (liens vers fichiers) | ❌ | ❌ |
| `MessageReference` sur la description | partiellement | ❌ |

### Le cas des tags

`Tag.name` est **en clair en base**, car il est sous `@@unique([organizationId, name])` : `prisma-field-encryption` utilise AES-GCM à IV aléatoire, donc non déterministe, ce qui interdit toute recherche par égalité ou contrainte d'unicité sur un champ chiffré.

Un dump SQL révèle donc **la taxonomie complète de chaque organisation** (« Client ACME », « Urgent RGPD », « Migration prod »…) — un renseignement souvent aussi parlant que les tâches elles-mêmes.

### Pièces jointes de tâche

Elles suivent le régime des fichiers (fiche [05](./05-fichiers-et-stockage.md)) :

| Cas | E2EE |
|---|---|
| Tâche rattachée à un espace (`spaceId` renseigné) | ✅ Oui (`WorkspaceKey`) |
| Tâche **hors espace** (`spaceId` nul) | ❌ **Non** — SSE serveur uniquement |

Elles sont rangées dans `<espace>/Tâches/<titre de la tâche>` via `ensureTaskAttachmentsFolder`. ⚠️ **Le titre de la tâche apparaît donc comme nom de dossier** dans le gestionnaire de fichiers — `Folder.name` est chiffré en base, mais c'est une duplication de la donnée à connaître.

### Durcissements d'audit appliqués

- `N1-bola-bfla-module-taches` (14/09/2026) : contrôles d'accès objet/fonction sur tout le module.
- `N5-ressources-non-bornees-agenda-taches` : pagination et bornage des requêtes.
- `N4-detournement-fichiers-edit-message-files` : impossible de rattacher un fichier tiers à sa propre tâche.

## 4. Module Agenda — inventaire détaillé

| Donnée | Chiffrée en base ? | E2EE ? |
|---|---|---|
| `CalendarEvent.title` | ✅ | ❌ |
| `CalendarEvent.description` | ✅ | ❌ |
| `CalendarEvent.location` | ✅ | ❌ |
| `startAt`, `endAt`, `allDay`, `timezone` | ❌ **Non** | ❌ |
| `color` | ❌ Non | ❌ |
| `recurrenceRule` (`Json`) | ❌ **Non** | ❌ |
| `recurrenceParentId`, `originalStartAt`, `isCancelled` | ❌ Non | ❌ |
| `creatorId`, `createdByDelegateId`, `organizationId` | ❌ Non | ❌ |
| `source` (NATIVE / EXTERNAL_GOOGLE / EXTERNAL_ICS) | ❌ Non | ❌ |
| `EventAttendee.userId`, `status`, `respondedAt` | ❌ **Non** | ❌ |
| `EventReminder` | ❌ Non | ❌ |
| `CalendarAccessGrant` (partage d'agenda) | ❌ Non | ❌ |

➡️ **L'emploi du temps complet de chaque utilisateur — horaires, durées, récurrences, participants, disponibilités — est lisible en clair dans la base.** Seuls le titre, la description et le lieu sont protégés par la couche de chiffrement au repos.

### Partage d'agenda (`CalendarAccessGrant`)

Modèle de délégation à trois niveaux (`level`), avec un cycle de demande/acceptation (`status`, `initiatedBy`). Purement applicatif : **le contrôle d'accès est côté serveur, pas cryptographique**. Révoquer un partage retire l'accès applicatif immédiatement — ce qui, contrairement aux clés de salon, est ici une révocation **effective**, puisque rien n'était chiffré pour le destinataire.

## 5. Intégrations externes : Google Calendar et ICS

Un agenda externe implique **par nature** que le contenu quitte le périmètre Synco en clair. L'E2EE est structurellement impossible ici. La sécurité porte donc sur la **protection des secrets d'accès**.

### Jetons OAuth Google

[`src/utils/googleCalendarCrypto.ts`](../../../synco_api/src/utils/googleCalendarCrypto.ts)

| Élément | Détail |
|---|---|
| Algorithme | AES-256-GCM |
| Clé | `SYNCO_GOOGLE_OAUTH_MASTER_KEY` — **volontairement distincte** de `SYNCO_WEBHOOK_MASTER_KEY` |
| Format | `ciphertext.tag` en base64 dans un seul champ + `iv` séparé |
| Démarrage | **Refus de démarrer** si la clé est absente ou < 32 octets |

> Justification documentée : « un refresh token Google donne accès au compte Google externe de l'utilisateur — c'est un secret de nature différente d'un token webhook interne à Synco, on ne veut pas qu'une compromission de l'un entraîne l'autre. »

Ce cloisonnement de clés est une bonne pratique correctement appliquée.

### Flux OAuth — protections

`ExternalCalendarOAuthState` est une ligne **éphémère et à usage unique** :
- son `id` sert directement de paramètre `state` OAuth, ce qui rattache le rappel Google (public, sans en-tête `Authorization`) au bon `userId`/`orgId` ;
- elle porte un **vérificateur PKCE** (`codeVerifier`) qui empêche l'interception du code d'autorisation ;
- elle est **supprimée après un seul usage** (ou à expiration).

### Notifications push Google (`events.watch`)

`webhookToken` est un secret **généré par Synco** (jamais par Google) et revérifié à chaque notification reçue, pour empêcher un tiers de forger des notifications vers cet endpoint public.

> Notons que le **contenu** de la notification n'est jamais lu : elle ne sert qu'à déclencher un re-fetch authentifié. C'est la bonne approche — on ne fait pas confiance à un message entrant non authentifié.

### URL de flux ICS

`ExternalCalendarConnection.icsUrl` porte l'annotation `/// @encrypted`, avec une justification explicite :

> « Traitée comme un secret : certains fournisseurs (Google "adresse secrète au format iCal"…) encodent un jeton d'accès directement dans l'URL, au même titre qu'un refresh token. »

Distinction correcte et rarement faite.

| Type | Sync | Sens |
|---|---|---|
| `GOOGLE` | Push (`events.watch`) + sync token incrémentale | **Bidirectionnelle** |
| `ICS_URL` | Polling horaire (`icsCalendarSync.ts`), diff complet | Lecture seule |
| `ICS_FILE` | Aucune resync auto (ré-upload manuel) | Lecture seule |

### `externalCalendarId` non chiffré

Volontairement, car sous contrainte d'unicité et utilisé dans un `upsert` par égalité. Le schéma précise que ce n'est qu'un identifiant technique (`"primary"`, `sha256(url)`, ou un cuid) — pas une donnée personnelle.

## 6. Flux d'export `.ics` (`AgendaFeedToken`)

Permet de s'abonner à son agenda Synco depuis un client externe (Apple Calendar, Thunderbird…).

```
GET /api/integrations/agenda-feed/<token>.ics     ← PUBLIC, aucune authentification
```

| Propriété | Valeur |
|---|---|
| Authentification | **Le jeton seul** — quiconque connaît l'URL lit l'agenda |
| Stockage | `AgendaFeedToken.token`, **en clair en base** (contrainte `@unique`) |
| Unicité | `@@unique([userId, organizationId])` — un seul lien actif par couple |
| Régénération | Remplace le jeton existant (`update`), n'en empile pas un second |
| Limitation de débit | `feedLimiter` |
| Traçabilité | `lastAccessedAt` mis à jour à chaque accès |
| Contenu | **Événements en clair** (format iCalendar standard) |

⚠️ **Un lien de flux `.ics` est une URL secrète, non révocable autrement qu'en la régénérant, transmise en clair dans la barre d'URL des clients de calendrier, et souvent journalisée par les proxys d'entreprise.** C'est le point d'exposition le plus large du module Agenda. À présenter comme tel aux utilisateurs.

> Durcissements associés : `N2-bfla-agenda-org-tierce` (14/09), `P15-quotas-flux-couteux` (20/09).

## 7. Que faudrait-il pour rendre ces modules E2EE ?

Pour information, si l'évolution était envisagée :

| Fonctionnalité | Impact d'un passage à l'E2EE |
|---|---|
| Titre/description de tâche et d'événement | ✅ Faisable — chiffrer avec la `WorkspaceKey` existante |
| Filtres Kanban par statut/assigné/échéance | ✅ Conservés (ces champs resteraient en clair) |
| Recherche plein texte dans les tâches | ⚠️ Nécessiterait le mécanisme d'`EncryptedSearchIndex` (fiche [10](./10-assistant-ia-et-recherche.md)) |
| Rappels d'échéance côté serveur | ❌ **Perdus** pour le contenu (le serveur ne pourrait plus composer « Rappel : <titre> ») — le corps de la notification devrait devenir générique, comme pour les messages |
| Vue agenda par plage de dates | ✅ Conservée (`startAt`/`endAt` restent en clair) |
| Synchronisation Google / ICS | ❌ **Incompatible** — nécessiterait un déchiffrement côté client avant export, donc un client en ligne |
| Flux `.ics` public | ❌ **Incompatible par nature** |
| Outils IA serveur sur les tâches | ❌ Incompatible sauf via la passerelle auto-hébergée |

Un mode « organisation à confidentialité renforcée », désactivant les intégrations externes en échange de l'E2EE sur ces modules, serait techniquement cohérent avec l'architecture existante (les `WorkspaceKey` sont déjà là).
