# 05 — Fichiers et stockage

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Fichiers clés** | [`src/cdn/FileCrypto.ts`](../../../synco_api/src/cdn/FileCrypto.ts), [`src/cdn/FileManager.ts`](../../../synco_api/src/cdn/FileManager.ts), [`src/cdn/cdnRoutes.ts`](../../../synco_api/src/cdn/cdnRoutes.ts), [`synco_app/src/assets/uploadFile.ts`](../../src/assets/uploadFile.ts), [`synco_app/src/assets/utils/downloadFile.ts`](../../src/assets/utils/downloadFile.ts), [`synco_app/src/assets/utils/workspaceCrypto.ts`](../../src/assets/utils/workspaceCrypto.ts) |
| **Modèles Prisma** | `StoredFile`, `WorkspaceKey`, `DMConversationKey`, `Folder`, `FilePermission` |
| **Statut** | ⚠️ **E2EE conditionnel** — dépend du contexte de dépôt |

---

## 1. Les deux couches, toujours cumulées

Un fichier E2EE déposé dans un espace de travail est chiffré **deux fois** :

```
Fichier original
   │
   ├─ [CLIENT]  AES-GCM(FileKey aléatoire)          ← E2EE
   │            FileKey scellée par la WorkspaceKey
   │
   └─ [SERVEUR] AES-256-GCM(FM_ENCRYPT_KEY) + HMAC-SHA512   ← SSE (chiffrement au repos)
                                                     │
                                               sur le disque
```

Un fichier **non** E2EE ne traverse que la seconde couche. **Aucun fichier n'est jamais stocké en clair sur disque.**

## 2. Couche serveur (SSE) — `FileCrypto.ts`

S'applique **systématiquement**, à tout fichier, E2EE ou non.

| Élément | Valeur |
|---|---|
| Algorithme | AES-256-GCM |
| Clé | `FM_ENCRYPT_KEY` (32 octets, exigés en 64 caractères hexadécimaux) |
| Dérivation | HKDF via HMAC-SHA512 avec l'étiquette `file-encryption-key-derivation` → **deux sous-clés distinctes** (chiffrement / HMAC) |
| IV | 12 octets aléatoires par fichier |
| Tag d'authentification GCM | 16 octets |
| Intégrité additionnelle | **HMAC-SHA512** (64 octets) sur `version ‖ iv ‖ authTag ‖ données` |
| Comparaison HMAC | `crypto.timingSafeEqual` (résistante aux attaques temporelles) |
| Traitement | Par flux (`stream`), morceaux de 1 Mo |

**Format sur disque :**

```
[version:1][iv:12][authTag:16][hmac:64][données chiffrées…]
```

Le champ `version` (valeur `1`) prépare une évolution de format ; un fichier d'une version inconnue est refusé au lieu d'être interprété.

Le HMAC est vérifié **avant** tout déchiffrement (`decryptFile`, `createDecryptStream`, `verifyFileIntegrity`), ce qui permet de détecter une altération sans jamais exposer d'octet déchiffré.

Au démarrage, `validateEncryptionKey()` **refuse de démarrer** si `FM_ENCRYPT_KEY` est absente ou ne fait pas exactement 32 octets.

> Choix de conception : le double emploi AES-GCM (déjà authentifié) + HMAC-SHA512 est redondant sur le plan cryptographique. Il apporte en pratique une vérification d'intégrité **sans déchiffrement** (utile pour `verifyFileIntegrity` et pour les téléchargements en flux) ; ce n'est donc pas une erreur, mais un compromis coût/robustesse assumé.

## 3. Couche E2EE client — `encryptFileLocal()`

```
1. FileKey  = AES-GCM 256 générée aléatoirement, unique à ce fichier (DEK)
2. iv       = 12 octets aléatoires
3. ciphertext = AES-GCM(FileKey, iv, contenu du fichier)
4. keyIv    = 12 octets aléatoires, DISTINCTS de iv
5. encryptedFileKey = keyIv ‖ AES-GCM(KEK, keyIv, FileKey)
```

Deux points notables :

- **Hiérarchie DEK/KEK classique** : une clé par fichier (DEK), scellée par la clé de l'espace ou de la conversation (KEK). Partager un fichier ne révèle jamais la KEK.
- **IV dédié pour le scellement de clé.** Le commentaire du code est explicite : ne jamais réutiliser un IV entre deux opérations AES-GCM, même sous des clés différentes. Le `keyIv` est préfixé au ciphertext de la clé, ce qui évite une colonne supplémentaire en base.

### Compatibilité ascendante

`decryptFileLocal()` tente d'abord le format actuel (`keyIv` en préfixe), et **se replie sur l'ancien format** (où la `FileKey` était scellée avec l'IV du fichier lui-même) en cas d'échec. La détection se fait **par le tag d'authentification AES-GCM**, pas par un marqueur de version explicite — les fichiers antérieurs au correctif restent donc lisibles.

## 4. Les KEK : quelle clé pour quel contexte

| Contexte de dépôt | KEK utilisée | Provenance |
|---|---|---|
| Espace de travail (`workspaceId`) | `WorkspaceKey` | [`workspaceCrypto.ts`](../../src/assets/utils/workspaceCrypto.ts) |
| Pièce jointe de DM (`dmPeerId`) | `DMConversationKey` | [`dmCrypto.ts`](../../src/assets/utils/dmCrypto.ts) |
| **Tout le reste** | **aucune** | ❌ **pas d'E2EE** |

### `WorkspaceKey` — bootstrap et distribution

```
GET /api/spaces/:id/key
  ├─ 200 → { encryptedKey, version } → RSA-OAEP → CryptoKey AES-GCM (mise en cache mémoire)
  └─ 404 → GET /api/spaces/:id/members-keys   (clés publiques de tous les membres)
           génération d'une nouvelle WorkspaceKey (v1)
           scellement RSA-OAEP pour CHAQUE membre possédant une publicKey
           POST /api/spaces/:id/key { keys: [...], version: 1 }   ← réservé aux admins
```

Un membre sans `publicKey` est ignoré (avec un `console.warn`). Si **aucun** membre n'a de clé publique, le bootstrap échoue explicitement.

> Un bug corrigé et documenté dans le code : `encryptSpaceKeyForMember()` importe lui-même le JWK ; lui passer un `CryptoKey` déjà importé faisait échouer le scellement silencieusement (exception avalée), si bien qu'**aucun membre ne recevait jamais de copie** et que la génération de clé échouait toujours.

## 5. ❌ Les cas où les fichiers ne sont PAS chiffrés de bout en bout

C'est le point le plus important de cette fiche.

`uploadFile()` ne chiffre que si `context.workspaceId` **ou** `context.dmPeerId` est renseigné. Sinon, le fichier part **en clair** vers le serveur, qui applique uniquement le SSE.

| Cas réel | `workspaceId` | E2EE ? |
|---|---|---|
| Message dans un salon d'un **espace de travail** | ✅ `route.params.spaceId` | ✅ **Oui** |
| Message dans un salon **d'accueil d'organisation** | ❌ `undefined` | ❌ **Non** |
| Pièce jointe de DM | — (`dmPeerId`) | ✅ **Oui** |
| Gestionnaire de fichiers d'un espace | ✅ | ✅ **Oui** |
| Pièce jointe de tâche **dans un espace** | ✅ `task.spaceId` | ✅ **Oui** |
| Pièce jointe de tâche **hors espace** (`spaceId` nul) | ❌ `undefined` | ❌ **Non** |
| Fichier filigrané (`WatermarkFile.vue`) | selon contexte | selon contexte |

➡️ **Un fichier envoyé dans un salon d'accueil d'organisation n'est pas chiffré de bout en bout**, alors que le message texte qui l'accompagne, lui, l'est (il utilise la `ThreadKey`). C'est une asymétrie que rien ne signale à l'utilisateur dans l'interface.

### Repli silencieux à l'upload

```ts
} catch (e) {
    console.error("Failed to encrypt file for upload:", e);
    // Fallback SSE for now if key generation fails
}
```

Si le chiffrement échoue (KEK indisponible, membre sans clé publique, erreur WebCrypto), **le fichier est envoyé en clair** avec `isE2EE = false`, sans que l'utilisateur en soit averti. Le commentaire du code reconnaît le problème (« on pourrait décider de fail si E2EE est requis »).

➡️ **Recommandation : faire échouer l'upload plutôt que de dégrader silencieusement**, ou au minimum afficher un avertissement explicite.

## 6. ⚠️ OnlyOffice — désactivation explicite de l'E2EE

L'édition collaborative de documents bureautiques exige que le serveur OnlyOffice lise le contenu en clair. L'E2EE est donc **incompatible par construction** avec cette fonctionnalité.

Le flux ([`FileViewer.vue`](../../src/views/OrgSpace/components/popup/FileViewer.vue)) :

1. le client télécharge le fichier chiffré ;
2. il le déchiffre localement avec la `WorkspaceKey` ;
3. il **ré-upload le contenu en clair** via `POST /api/cdn/disable-e2ee/:id` ;
4. le serveur remplace le contenu, met `isE2EE = false`, `encryptedFileKey = null`, `iv = null` ;
5. l'éditeur OnlyOffice est chargé.

**Cette opération est irréversible sans action manuelle.** Il n'existe pas de « ré-activation » automatique de l'E2EE après fermeture de l'éditeur ; seul un ré-upload complet du fichier le rechiffrerait. À partir de là, le document est protégé uniquement par le SSE serveur.

La route `POST /api/cdn/update-e2ee-content/:id` existe pour réenregistrer un fichier **déjà** E2EE (édition Markdown, par exemple) sans dégradation — elle refuse explicitement un fichier non-E2EE.

Les deux routes exigent `WRITE` **et** `UPLOAD` (durcissement de l'audit `P8`).

### Durcissements OnlyOffice

- Le secret JWT (`ONLYOFFICE_JWT_SECRET`) est obligatoire au démarrage (audit `C4-oracle-signature-jwt-onlyoffice`).
- `StoredFile.onlyOfficeKey` est émis à l'ouverture d'une session d'édition et comparé au `body.key` du rappel — empêche le rejeu d'un jeton de configuration signé contre un autre fichier.
- L'URL de téléchargement du rappel est validée contre une **liste blanche d'hôtes** (`isAllowedOnlyOfficeDownloadUrl`) — protection SSRF, audit `CRIT-D`.

## 7. Validation du type MIME — deux chemins

| Cas | Traitement |
|---|---|
| Upload **non** E2EE | Détection par **signature binaire** (`file-type`). Si indétectable et hors liste blanche texte (`text/plain`, `text/csv`, `application/json`, `text/markdown`) → forcé en `application/octet-stream` + `forceDownload = true`. Bloque le XSS stocké via SVG/HTML rendus en ligne (audit `L5`). |
| Upload **E2EE** | La détection est **désactivée** : les octets sur disque sont du ciphertext, la signature n'a aucun sens. Le type déclaré par le client est accepté tel quel. Le risque XSS ne s'applique pas — le serveur ne sert que des octets aléatoires opaques, jamais du balisage interprétable. |

## 8. Téléchargement

```
GET /api/cdn/meta/:id   → métadonnées (dont isE2EE, encryptedFileKey, iv, workspaceId, dmPeerId)
   │
   ├─ isE2EE = false → lien direct GET /api/cdn/download/:id?token=… (le serveur déchiffre le SSE)
   │
   └─ isE2EE = true  → GET /api/cdn/download/:id → ArrayBuffer chiffré
                       résolution de la KEK (workspaceId ou dmPeerId)
                       decryptFileLocal() → Blob → URL.createObjectURL
```

`GET /meta/:id` résout `dmPeerId` **côté serveur** (l'autre participant de la conversation) pour que l'appelant n'ait pas à le connaître.

`getFilePreviewUrl()` applique exactement le même chemin pour l'affichage en ligne (vignettes de pièces jointes de tâches, aperçus).

> Note : le mode non-E2EE passe le jeton Keycloak **dans l'URL** (`?token=Bearer …`), ce qui l'expose aux journaux de serveur, à l'historique du navigateur et au `Referer`. Pratique courante pour les téléchargements directs, mais à surveiller.

## 9. Métadonnées de fichier

| Champ `StoredFile` | Chiffré en base ? | Visible par le serveur ? |
|---|---|---|
| `originalName` | ✅ | ❌ (mais déchiffrable par l'API) |
| `hash` | ✅ | ❌ |
| `encryptedFileKey`, `iv` | ✅ | — (inexploitable sans la KEK) |
| `mimeType` | ❌ **Non** | ✅ **Oui** |
| `size` | ❌ **Non** | ✅ **Oui** |
| `isE2EE`, `isEncrypted`, `keyVersion` | ❌ Non | ✅ Oui |
| `ownerId`, `orgId`, `workspaceId`, `messageId`, `folderId`, `taskId` | ❌ Non | ✅ **Oui** |
| `onlyOfficeKey` | ❌ Non | ✅ Oui |

Le serveur connaît donc **qui a déposé quoi, où, quand, de quelle taille et de quel type** — même pour un fichier parfaitement E2EE.

Les noms de dossiers (`Folder.name`, `Folder.color`) sont chiffrés en base mais **pas E2EE**.

## 10. Filigrane (watermark)

[`synco_app/src/assets/utils/watermark.ts`](../../src/assets/utils/watermark.ts) applique un filigrane **entièrement côté client** (Canvas pour les images, `pdf-lib` pour les PDF) **avant** l'upload et donc avant le chiffrement. Le serveur ne voit jamais la version non filigranée.

C'est une mesure de **traçabilité/dissuasion**, pas de confidentialité : elle ne protège en rien contre une capture d'écran ou un recadrage.

## 11. Mass assignment et permissions

- Une **liste blanche stricte** encadre les métadonnées modifiables par le client (`orgId`, `ownerId`, `isE2EE`, `hash`, `size` ne sont jamais mass-assignables) — audit `M9-mass-assignment-metadata-fichier`.
- Le conteneur d'upload (`folderId`, `workspaceId`) est validé côté serveur — audit `H8-bola-conteneur-upload-non-valide`.
- Le déplacement de fichier entre dossiers vérifie l'appartenance du dossier cible à l'espace — audits `M10` et `P18-dossier-parent-hors-espace`.
- L'écrasement de fichier exige la permission, plus seulement le statut de membre — audit `H7-bfla-ecrasement-fichier-simple-membre`.
