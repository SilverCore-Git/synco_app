# Prompt d'Implémentation : Recherche Sémantique E2EE

Tu es un Agent IA spécialisé dans le développement fullstack (Vue 3 / Node.js / TypeScript) et la cryptographie E2EE. 
Ton objectif est d'implémenter la fonctionnalité de "Recherche Sémantique E2EE" (Ultra Recherche) pour le projet Synco.

## 📋 Contexte et Pré-requis
1. **Lis impérativement** les règles fondamentales du projet dans `vibe/guide.md`.
2. **Lis attentivement** la spécification architecturale détaillée dans `vibe/features/SEMANTIC_SEARCH_FEATURE.md`.

## 🎯 Tes Objectifs

Tu dois implémenter le cycle complet d'extraction de texte, de vectorisation, de chiffrement E2EE et de synchronisation des données de recherche, de bout en bout (Frontend et Backend).

### Phase 1 : Frontend - Génération et Chiffrement (Le Cerveau Local)
1. **Génération de Vecteurs** : Intègre la librairie `@xenova/transformers` dans le frontend. Crée un utilitaire (idéalement un Web Worker pour ne pas bloquer l'interface) responsable de convertir du texte en clair en vecteurs mathématiques en utilisant un modèle léger (ex: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`).
2. **Extraction PDF** : Intègre `pdf.js` pour extraire le texte brut des fichiers PDF *avant* leur chiffrement (lors de l'upload) ou *après* leur déchiffrement (lors de la consultation).
3. **Chiffrement de l'Index** : Développe la logique permettant au navigateur de chiffrer le vecteur généré ET le texte extrait avec la clé symétrique AES-GCM (la même utilisée pour l'E2EE du workspace ou du destinataire). 

### Phase 2 : Backend - Stockage "Aveugle" (La Synchronisation)
1. **Prisma Schema** : Modifie `schema.prisma` dans le backend (`synco_api`) pour ajouter un modèle `EncryptedSearchIndex` (lié à l'espace de travail ou à l'utilisateur). Ce modèle doit stocker les vecteurs chiffrés (`encryptedBlob`), leur vecteur d'initialisation (`iv`) et l'ID de la ressource liée.
2. **Routes & API** : Crée les routes REST ou les événements WebSocket permettant aux clients de sauvegarder et de récupérer ces "blobs" chiffrés.
> ⚠️ **Le backend ne doit faire aucune manipulation sur ces données, il se contente de les stocker et de les distribuer.**

### Phase 3 : Frontend - Indexation Locale (La Recherche Instantanée)
1. **Base Vectorielle Locale** : Intègre une solution de recherche vectorielle côté client (comme `Orama` ou une gestion via `IndexedDB`) pour maintenir l'index local.
2. **Restauration** : À la connexion de l'utilisateur, développe la logique pour récupérer les index chiffrés depuis le serveur, les déchiffrer avec la clé locale, et les charger en mémoire (`LocalVectorDocument`) pour permettre des requêtes instantanées.

## ⚠️ Contraintes Strictes à Respecter
- **E2EE Absolu** : Le serveur ne doit **JAMAIS** recevoir de texte en clair ou de vecteurs en clair. Une fuite de vecteur est une fuite de contexte sémantique, ce qui brise la promesse de sécurité de Synco.
- **Performance** : Les modèles d'IA (`Transformers.js`) et les processus de déchiffrement/extraction (`pdf.js`) peuvent être lourds. Utilise des traitements asynchrones (Promises, Web Workers) pour que l'interface utilisateur (UI) ne freeze jamais.
- **Typage Strict** : Utilise TypeScript avec le mode strict. Pas de `any`. Valide toutes les données entrantes et sortantes sur l'API avec Zod.

## 🚀 Comment procéder
1. Analyse l'architecture existante (gestion E2EE actuelle dans `ChatView.vue`, `useSecurePeer.ts` et la structure backend).
2. Propose un plan d'action technique par étapes (installation des libs, modifs backend, modifs frontend).
3. Exécute le code par petits commits fonctionnels et vérifie systématiquement le chiffrement réseau avant de valider.
