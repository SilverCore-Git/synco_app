# Documentation de sécurité Synco — Chiffrement de bout en bout & chiffrement au repos

> **Date du rapport :** 28 septembre 2026
> **Périmètre :** `synco_app` (client Vue/Capacitor/Tauri), `synco_api` (Express + Prisma + PostgreSQL + WebSocket + CDN), `Synco_AI_Gateway` (passerelle Rust auto-hébergée), serveur de signalisation PeerJS, serveur LiveKit, Keycloak.
> **Méthode :** lecture exhaustive du code source des trois dépôts à la date ci-dessus (schéma Prisma, primitives cryptographiques, routes de distribution de clés, composables temps réel), recoupée avec les campagnes d'audit internes `synco_api/audits/`.
> **Auteur :** rapport généré à partir de l'état réel du code, pas de la documentation commerciale.

---

## ⚠️ Avertissement de fraîcheur

**Ce document décrit l'état du code au 28 septembre 2026 et uniquement à cette date.**

Synco est en développement actif : le schéma PIN a déjà connu trois générations (`legacy`, `v2:`, `v3:`), le format d'enveloppe des clés de fichier a changé au moins une fois (fallback de compatibilité toujours présent dans `decryptFileLocal`), les webhooks sont passés d'une clé symétrique mal nommée à de l'ECDH P-256, et cinq campagnes de pentest internes ont modifié la surface cryptographique entre le 10/09 et le 20/09/2026.

Il faut donc considérer que :

- **des évolutions ont pu intervenir depuis** : nouveaux schémas de clés, rotation ajoutée, primitives remplacées, modules chiffrés qui ne l'étaient pas (ou l'inverse) ;
- **les listes de champs chiffrés en base sont datées** : tout nouveau modèle Prisma ajouté après cette date n'y figure pas ;
- **les constantes citées** (itérations PBKDF2, courbes de backoff, tailles de clés) sont celles lues dans le code à cette date et doivent être revérifiées avant toute communication externe ;
- avant d'utiliser ce document comme référence contractuelle, de conformité ou commerciale, **rejouer la vérification** sur `synco_app/src/assets/utils/crypto.ts`, `synco_api/prisma/schema.prisma` et `synco_api/src/cdn/FileCrypto.ts`.

---

## Résumé exécutif

Synco applique **deux couches de chiffrement distinctes et cumulatives**, qu'il ne faut jamais confondre :

| | Couche 1 — **Chiffrement au repos (côté serveur)** | Couche 2 — **Chiffrement de bout en bout (E2EE)** |
|---|---|---|
| Qui détient la clé | Le serveur (`PRISMA_FIELD_ENCRYPTION_KEY`) | L'utilisateur seul (clé privée RSA-4096 déverrouillée par code PIN) |
| Contre quoi ça protège | Vol de dump SQL, vol de disque, sauvegarde exfiltrée, accès direct à PostgreSQL | Administrateur Synco malveillant, compromission applicative du serveur, réquisition |
| Portée | **Absolument tout contenu utilisateur** (voir §2) | Un sous-ensemble : messages, appels, une partie des fichiers, sessions IA, index de recherche |
| Si le serveur est compromis au niveau applicatif | ❌ Contourné (l'API possède la clé) | ✅ Tient (le serveur ne voit que du chiffré) |

**Règle à retenir : tout est chiffré côté base de données. Une partie seulement est chiffrée de bout en bout.**

---

## Tableau de synthèse : qu'est-ce qui est E2EE ?

| Domaine | Contenu | E2EE ? | Chiffré en base ? | Fiche |
|---|---|---|---|---|
| **Messages de salon (Thread)** | corps du message | ✅ **Oui** — AES-256-GCM sous `ThreadKey`, distribuée par RSA-OAEP | ✅ (par-dessus) | [03](./03-messages-salons-threads.md) |
| | métadonnées (auteur, salon, horodatage, réponses) | ❌ Non | ✅ partiellement | [03](./03-messages-salons-threads.md) |
| | réactions emoji | ❌ Non | ❌ **Non — en clair** | [03](./03-messages-salons-threads.md) |
| **Messages privés (DM)** | corps du message | ✅ **Oui** — enveloppe RSA-OAEP + AES-GCM par message | ✅ (par-dessus) | [04](./04-messages-prives-dm.md) |
| | invitations vocales (nom du salon) | ❌ Non | ✅ | [04](./04-messages-prives-dm.md) |
| **Fichiers — dans un espace de travail** | contenu | ✅ **Oui** — format v2 par morceaux, DEK scellée par `WorkspaceKey` | chiffré uniquement | [05](./05-fichiers-et-stockage.md) |
| **Fichiers — pièce jointe de DM** | contenu | ✅ **Oui** — `DMConversationKey` | chiffré uniquement | [05](./05-fichiers-et-stockage.md) |
| **Fichiers — salon « accueil » d'organisation** | contenu | ✅ **Oui** — `ThreadKey` du salon | chiffré uniquement | [05](./05-fichiers-et-stockage.md) |
| **Fichiers — pièce jointe de tâche hors espace** | contenu | n/a — refusé (rattacher la tâche à un projet) | n/a | [05](./05-fichiers-et-stockage.md) |
| | nom du fichier, hash, taille, type MIME | ❌ Non | ✅ (sauf taille/MIME) | [05](./05-fichiers-et-stockage.md) |
| **Appels privés 1-à-1 (P2P)** | audio/vidéo | ✅ **Oui, double** — DTLS-SRTP + surchiffrement AES-GCM par trame (ECDH P-256 éphémère) | n/a (rien stocké) | [06](./06-appels-prives-p2p.md) |
| | signalisation (SDP, ICE) | ⚠️ Chiffrée uniquement après ouverture du canal sécurisé | n/a | [06](./06-appels-prives-p2p.md) |
| **Salons vocaux de Thread (LiveKit)** | audio/vidéo | ✅ **Oui** — E2EE natif LiveKit, clé = `ThreadKey` du salon | n/a | [07](./07-salons-vocaux-livekit.md) |
| | invités par lien d'invitation | ❌ **Non** — pas de `ThreadKey`, appel non E2EE | n/a | [07](./07-salons-vocaux-livekit.md) |
| **Sessions éphémères** | messages + fichiers | ✅ **Oui** — enveloppe RSA-OAEP éphémère, P2P direct, **rien n'est jamais stocké** | n/a | [08](./08-sessions-ephemeres.md) |
| **Tâches (Todo / Kanban)** | titre, description | ❌ **Non** | ✅ | [09](./09-taches-agenda-calendrier.md) |
| | tags, listes, ordres, assignations | ❌ Non | ✅ partiellement | [09](./09-taches-agenda-calendrier.md) |
| **Agenda / Calendrier** | titre, description, lieu | ❌ **Non** | ✅ | [09](./09-taches-agenda-calendrier.md) |
| | dates, récurrence, participants, couleurs | ❌ Non | ❌ **Non — en clair** | [09](./09-taches-agenda-calendrier.md) |
| **Agenda externe (Google / ICS)** | jetons OAuth, URL de flux ICS | ❌ Non (E2EE impossible par nature) | ✅ clé maître dédiée | [09](./09-taches-agenda-calendrier.md) |
| **Assistant IA — passerelle auto-hébergée** | prompts, réponses, arguments d'outils | ✅ **Oui** — AES-GCM `gcm1:` sous `AiSessionKey` d'organisation | ✅ (par-dessus) | [10](./10-assistant-ia-et-recherche.md) |
| **Assistant IA — OpenAI / Mistral / Gemini** | prompts, réponses | ❌ **Non** — boucle d'agent côté serveur, contenu lisible par `synco_api` et le fournisseur | ✅ | [10](./10-assistant-ia-et-recherche.md) |
| **Recherche sémantique** | texte indexé + vecteur d'embedding | ✅ **Oui** — AES-GCM sous la `ThreadKey` du salon | ✅ (par-dessus) | [10](./10-assistant-ia-et-recherche.md) |
| **Webhooks entrants** | contenu du message posté | ❌ **Non E2EE au sens Synco** — chiffré ECDH côté serveur | ✅ | [11](./11-webhooks-notifications-presence.md) |
| **Notifications push (FCM/APNS)** | titre, corps | ❌ Non chiffré vers Apple/Google — **mais ne contient jamais le contenu du message** | ✅ en base | [11](./11-webhooks-notifications-presence.md) |
| **Profil utilisateur** | email, nom, pseudo, avatar, poste, bio | ❌ Non | ✅ | [02](./02-chiffrement-base-de-donnees.md) |
| **Clé privée de l'utilisateur** | PKCS#8 RSA-4096 | ✅ **Chiffrée par le PIN + secret serveur** — jamais en clair côté serveur | ✅ (par-dessus) | [01](./01-fondations-cryptographiques.md) |

---

## Index des fiches

| # | Fiche | Contenu |
|---|---|---|
| 01 | [Fondations cryptographiques](./01-fondations-cryptographiques.md) | Identité RSA-4096, code PIN v1/v2/v3, dérivation de la clé maître, verrou serveur anti-force-brute, Trust-On-First-Use |
| 02 | [Chiffrement côté base de données](./02-chiffrement-base-de-donnees.md) | `prisma-field-encryption`, inventaire exhaustif des champs chiffrés et **non** chiffrés |
| 03 | [Messages de salons (Threads)](./03-messages-salons-threads.md) | `ThreadKey`, distribution, envoi/réception, métadonnées exposées |
| 04 | [Messages privés (DM)](./04-messages-prives-dm.md) | Enveloppe hybride par message, double scellement expéditeur/destinataire, `DMConversationKey` |
| 05 | [Fichiers et stockage](./05-fichiers-et-stockage.md) | Tout E2EE (format v2), clés par contexte, synco_cdn et tickets signés, quota, filigrane |
| 06 | [Appels privés P2P](./06-appels-prives-p2p.md) | WebRTC, ECDH P-256 + HKDF, surchiffrement par trame (Insertable Streams), empreinte SAS |
| 07 | [Salons vocaux LiveKit](./07-salons-vocaux-livekit.md) | SFU, E2EE natif LiveKit adossée à la `ThreadKey`, cas de dégradation |
| 08 | [Sessions éphémères](./08-sessions-ephemeres.md) | Canal PeerJS direct, clés de session jetables, transfert de fichiers chiffré par morceaux, zéro persistance |
| 09 | [Tâches, agenda, calendrier](./09-taches-agenda-calendrier.md) | Ce qui n'est **pas** E2EE et pourquoi, synchronisation Google/ICS, flux .ics |
| 10 | [Assistant IA et recherche](./10-assistant-ia-et-recherche.md) | `AiSessionKey`, format `gcm1:`, passerelle Rust, index de recherche chiffré |
| 11 | [Webhooks, notifications, présence](./11-webhooks-notifications-presence.md) | ECDH webhooks, HMAC de signature, contenu des push, fuite de métadonnées |
| 12 | [Périmètre, limites et modèle de menace](./12-perimetre-limites-modele-de-menace.md) | Ce que l'E2EE **ne** protège **pas**, absence de rotation, métadonnées, récupération de compte |

---

## Inventaire des primitives utilisées

| Usage | Algorithme | Paramètres |
|---|---|---|
| Identité utilisateur | RSA-OAEP | 4096 bits, SHA-256, e=65537 |
| Scellement de clés symétriques | RSA-OAEP | SHA-256 |
| Contenu (messages, fichiers, IA, index) | AES-GCM | 256 bits, IV 96 bits aléatoire, tag 128 bits |
| Dérivation depuis le PIN (legacy) | PBKDF2-HMAC-SHA256 | 100 000 itérations |
| Dérivation depuis le PIN (v2) | PBKDF2-HMAC-SHA256 | 600 000 itérations (recommandation OWASP 2023) |
| Dérivation depuis le PIN (v3) | PBKDF2-HMAC-SHA256 + HKDF-SHA256 | 210 000 itérations, puis HKDF avec secret serveur |
| Preuve de PIN côté serveur (v3) | HMAC-SHA256 | étiquette `synco-pin-verifier-v3` |
| Accord de clé d'appel P2P | ECDH P-256 → HKDF-SHA256 | sel = SHA-256(callId), info = `SilverTeams-Call-E2EE-Key` |
| Fichiers (client, format v2) | AES-256-GCM par morceaux de 4 Mio | nonce = préfixe 8 octets ‖ index, AAD = index ‖ dernier |
| Tickets de transfert synco_cdn | Ed25519 | signés par l'API, vérifiés par le CDN (clé publique) |
| Chiffrement de champ en base | AES-256-GCM | `prisma-field-encryption`, clé `PRISMA_FIELD_ENCRYPTION_KEY` |
| Clés de webhook | ECDH P-256 | secp256r1, SPKI/PEM + DER |
| Jetons OAuth agenda externe | AES-256-GCM | clé maître dédiée `SYNCO_GOOGLE_OAUTH_MASTER_KEY` |
| Empreintes de vérification | SHA-256 | tronquée à 16 caractères hexadécimaux majuscules |

Toute la cryptographie côté client passe par **WebCrypto (`crypto.subtle`)** — aucune implémentation maison, aucune bibliothèque cryptographique tierce dans le chemin critique. Côté serveur, c'est le module `node:crypto` natif.

---

## Note de méthode

Ce document a été produit par lecture directe du code, sans exécution. Les affirmations « ✅ E2EE » reposent sur la vérification que **la clé de déchiffrement n'existe jamais en clair côté serveur** dans le chemin de code concerné, pas sur la présence d'un champ nommé `isE2EE` ou d'un commentaire l'affirmant. Les cas où le code annonce l'E2EE mais dégrade silencieusement (repli SSE sur échec de chiffrement à l'upload, salons vocaux sans `ThreadKey`, sessions IA legacy) sont signalés comme tels dans les fiches concernées et récapitulés en fiche [12](./12-perimetre-limites-modele-de-menace.md).
