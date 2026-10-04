# 05 — Fichiers et stockage

| | |
|---|---|
| **Date** | 2026-10-01 |
| **Fichiers clés** | [`synco_app/src/services/transfers/`](../../src/services/transfers/) (`chunkedUpload.ts`, `chunkedDownload.ts`, `cdn.ts`), [`synco_app/src/assets/utils/chunkedCryptoCore.ts`](../../src/assets/utils/chunkedCryptoCore.ts), [`synco_app/src/assets/utils/fileKeys.ts`](../../src/assets/utils/fileKeys.ts), [`synco_api/src/cdn/`](../../../synco_api/src/cdn/) (`cdnTransfers.ts`, `cdnTickets.ts`, `cdnInternalServer.ts`), dépôt `synco_cdn` |
| **Modèles Prisma** | `StoredFile`, `CdnTransfer`, `WorkspaceKey`, `DMConversationKey`, `ThreadKey`, `Folder`, `FilePermission` |
| **Statut** | ✅ **Tout fichier est chiffré de bout en bout** |

---

## 1. Principe

Le contenu d'un fichier est chiffré **sur l'appareil**, avant tout envoi, et
déchiffré **sur l'appareil** après téléchargement. Aucun serveur ne voit
jamais le clair ni ne détient de quoi le déchiffrer :

- **synco_api** décide : droits, quota, métadonnées. Le contenu ne passe
  jamais par elle.
- **synco_cdn** (`cdn.synco.one`, service Rust) stocke et sert des octets
  chiffrés, sans rien savoir des utilisateurs ni des clés.

Il n'existe plus de chiffrement côté serveur ni de fichier « non E2EE » : un
contexte sans clé partagée refuse l'envoi plutôt que de stocker en clair.

## 2. Format de fichier (v2, par morceaux) — `chunkedCryptoCore.ts`

```
DEK         = AES-GCM 256 aléatoire, unique au fichier
chiffré     = C_0 ‖ C_1 ‖ … ‖ C_{n-1}
C_i         = AES-GCM(DEK, nonce_i, M_i, aad_i)      M_i : 4 Mio de clair
nonce_i     = préfixe aléatoire (8 octets) ‖ i (uint32 BE)
aad_i       = "synco-e2ee-v2" ‖ i ‖ dernier ? 1 : 0
encryptedFileKey = keyIv ‖ AES-GCM(KEK, keyIv, DEK)
iv (métadonnée)  = "v2:<taille des morceaux>:<préfixe de nonce>"
```

- Chaque morceau est authentifié séparément : un morceau modifié, déplacé,
  dupliqué ou une troncature à une frontière de morceau sont détectés
  (index et marqueur « dernier » dans l'AAD).
- Morceaux (dé)chiffrés en parallèle dans un pool de Web Workers : la
  mémoire utilisée est bornée, quelle que soit la taille du fichier.
- Hiérarchie DEK/KEK : une clé par fichier, scellée par la clé du contexte.
  Modifier un fichier (éditeur texte) génère une **nouvelle** DEK.

## 3. Les KEK : quelle clé pour quel contexte — `fileKeys.ts`

| Contexte | KEK | Qui peut déchiffrer |
|---|---|---|
| Espace (fichiers, salons d'espace, tâches d'un projet) | `WorkspaceKey` | Membres de l'espace |
| Pièce jointe de DM | `DMConversationKey` | Les 2 participants |
| Salon d'accueil d'organisation | `ThreadKey` (la clé des messages du salon) | Membres du salon |
| Tâche sans projet | — | **Images refusées** (« rattachez la tâche à un projet ») |

`GET /api/cdn/meta/:id` renvoie de quoi retrouver la KEK : `workspaceId`,
`dmPeerId` (l'autre participant, résolu par l'API) ou `threadId` (salon
d'une pièce jointe hors espace).

## 4. Transferts : tickets signés

```
Envoi
  app ──POST /api/cdn/transfers/uploads──▶ API : droits, quota, CdnTransfer
      ◀── ticket « up » (Ed25519, 1 h, lié au transfert, au fichier, à la taille)
  app ──parts chiffrées + ticket──▶ CDN (en parallèle, reprise par part)
  app ──complete──▶ CDN ──rappel signé HMAC──▶ API : droits revérifiés, StoredFile créé

Téléchargement
  app ──GET /api/cdn/meta/:id──▶ API : droits ; ticket « down » (15 min,
                                     lié à la taille et à la date du contenu)
  app ──requêtes Range + ticket──▶ CDN ──▶ morceaux chiffrés ──▶ déchiffrés localement
```

- **Ticket** (`sct1.<kid>.<contenu>.<signature>`) : signé par l'API avec une
  clé Ed25519 que seule l'API détient ; le CDN ne vérifie qu'avec la clé
  publique, sans appeler l'API. Portée étroite (une opération, un fichier),
  durée courte, révocable (bannissement, suppression de compte, expulsion
  d'une organisation).
- **Le ticket autorise à écrire des octets, pas à publier un fichier** : à
  la fin de l'envoi, l'API revérifie les droits avant d'enregistrer le
  fichier ; refusé, le CDN supprime les octets.
- **Plus aucun jeton Keycloak dans une URL** : aperçus et téléchargements
  passent par des URL `blob:` locales.
- Contenu remplacé pendant un téléchargement (édition par un autre membre) :
  le CDN répond `409`, le client recommence avec le nouveau contenu au lieu
  de mélanger deux versions.

## 5. Quota

`utilisé = Σ tailles des fichiers + Σ tailles des envois en cours`. Un envoi
réserve sa taille dès l'ouverture, dans une transaction PostgreSQL
`Serializable` : des envois simultanés ne dépassent jamais la limite
ensemble. Au plus 16 envois ouverts par utilisateur.

## 6. Ce que voient les serveurs

| Donnée | API (base) | CDN |
|---|---|---|
| Contenu | ❌ jamais | Chiffré uniquement |
| `originalName` | Chiffré en base (déchiffrable par l'API) | ❌ |
| `encryptedFileKey`, `iv` | Chiffrés en base, inexploitables sans la KEK | ❌ |
| `mimeType` (déclaré par le client), `size` | ✅ | Taille seulement |
| Propriétaire, organisation, espace, dossier, message | ✅ | Identifiant de l'utilisateur dans le ticket |

Comme tout service de stockage chiffré, les serveurs savent **qui a déposé
quoi, où, quand et de quelle taille**, pas le contenu.

## 7. Fonctionnalités retirées

- **OnlyOffice** : l'édition collaborative de documents bureautiques exigeait
  le document en clair sur le serveur, incompatible avec le chiffrement de
  bout en bout de tous les fichiers. Les documents Word, Excel et PowerPoint
  se téléchargent et s'éditent localement.
- **Désactivation du chiffrement d'un fichier** (`disable-e2ee`) : supprimée
  avec OnlyOffice.

## 8. Filigrane

Appliqué **côté client** (Canvas pour les images, `pdf-lib` pour les PDF)
sur le fichier déchiffré, puis la copie filigranée est chiffrée et envoyée
comme un nouveau fichier. Mesure de traçabilité, pas de confidentialité.

## 9. Permissions

- Lecture : `READ` et appartenance à l'espace du fichier (audit `P7`).
- Dépôt : `UPLOAD`, module Fichiers de l'abonnement, conteneur de
  destination validé (audits `P8`, `H8`), rejoués à la fin de l'envoi.
- Modification du contenu : propriétaire, ou `WRITE` + `UPLOAD`.
- Suppression : `CONTENT_DELETE`.
- Métadonnées modifiables par le client : nom et dossier seulement, dossier
  de la même organisation (audit `M9`).
