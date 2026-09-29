# 🖼️ FEATURE: Aperçu des médias joints aux messages

Les images, fichiers audio et vidéos joints à un message (DM via `ChatMessage.vue`, salon via `ThreadMessage.vue`) sont déchiffrés côté client et affichés directement dans le fil, au lieu de la simple carte « nom + taille + télécharger ».

## Comportement

- **≤ 15 Mo** (`AUTO_LOAD_MAX_BYTES`) : chargement + déchiffrement lancés dans `onMounted`, donc après le premier rendu Vue (squelette de taille fixe pendant le chargement).
- **> 15 Mo** : un bouton « Charger / Déchiffrer » ; rien n'est téléchargé tant que l'utilisateur ne l'a pas demandé.
- **Image** : vignette dans le message, clic → visionneuse plein écran (`MediaLightbox.vue`).
- **Audio** : `<audio controls>` ; **vidéo** : `<video controls playsinline>`.
- **Échec** (clé absente, type non autorisé, signature incohérente, codec illisible) : retour à la carte fichier classique, téléchargement toujours possible.
- Les pièces jointes non médias gardent la carte existante.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/assets/utils/mediaTypes.ts` | Liste blanche MIME → `image` / `audio` / `video`, vérification des octets magiques après déchiffrement. Pur, testé. |
| `src/assets/utils/mediaCache.ts` | Cache d'URL `blob:` : dédoublonnage des chargements en cours, compteur de références, éviction LRU au-delà d'un budget mémoire (révocation des URL), 3 chargements simultanés max. Pur (loader injecté), testé. |
| `src/assets/utils/mediaPreview.ts` | Instance unique du cache branchée sur `fetchDecryptedFile()`. |
| `src/assets/utils/downloadFile.ts` | `fetchDecryptedFile()` extrait : métadonnées → octets → déchiffrement E2EE éventuel. Mutualisé avec `downloadFile` / `getFilePreviewUrl`. |
| `components/common/MessageAttachments.vue` | Sépare médias / autres fichiers, remplace le bloc dupliqué des deux composants de message. |
| `components/common/MessageMedia.vue` | Un média : états `idle` / `loading` / `ready` / `error`. |
| `components/common/MediaLightbox.vue` | Visionneuse d'image (Échap, téléchargement). |

Aucun changement backend.

## Sécurité

- Le type MIME d'un fichier E2EE est **déclaré par l'expéditeur** (le serveur ne voit que du chiffré). Un pair malveillant peut annoncer `image/svg+xml` ou `text/html` : d'où une liste blanche stricte (pas de SVG, pas d'HTML) et une vérification de signature binaire sur le clair avant tout rendu.
- Le `Blob` est reconstruit avec le type normalisé de la liste blanche ; les URL `blob:` ne sont rendues que dans `<img>` / `<audio>` / `<video>`, jamais ouvertes dans un onglet ou une iframe (même origine que l'app).
- L'aperçu passe toujours par `sfetch` (en-tête `Authorization`) — pas de jeton dans l'URL, même pour un fichier non E2EE.
- CSP : ajout de `media-src 'self' blob:` (`index.html`, `src-tauri/tauri.conf.json`), sans quoi `default-src 'self'` bloque l'audio/vidéo en `blob:`.

## Limites connues

- Chiffrement E2EE monobloc (un seul AES-GCM par fichier) : une vidéo doit être entièrement téléchargée et déchiffrée en mémoire avant lecture. Un chiffrement par blocs (streaming, `Range`) toucherait au protocole — chantier séparé.
- Pas de miniature ni de dimensions stockées à l'upload : la vignette d'une photo de 10 Mo télécharge la photo entière.
