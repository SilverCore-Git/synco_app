# 🤖 Prompt de Session : Implémentation du Module Todo List

**Instructions pour la session IA (Antigravity) :**

Bonjour ! Dans cette session, ton objectif est de développer la nouvelle fonctionnalité de "Todo List et Suivi de Projet" pour Synco (une alternative souveraine et ultra-sécurisée à Slack/Teams).

## 📄 Contexte et Spécifications

Avant de commencer à coder ou de modifier quoi que ce soit, tu dois **impérativement** :
1. Lire le guide de développement du projet : `synco_app/vibe/guide.md`.
2. Lire les spécifications détaillées de la fonctionnalité que tu vas coder dans : `synco_app/vibe/features/TODO_MODULE_FEATURE.md`.

## 🎯 Ton Objectif

Développer la fonctionnalité de A à Z (Backend + Frontend) en respectant **strictement** les spécifications.

### Les points critiques à implémenter :
1. **Architecture Modulaire (Toggle ON/OFF)** : Le module doit pouvoir être activé ou désactivé facilement via les paramètres de l'organisation. Côté frontend, le rendu et le chargement doivent être conditionnels (`defineAsyncComponent`). Côté backend, un middleware doit bloquer les routes si l'organisation n'a pas activé le module.
2. **Simplicité Extrême (UX)** : L'utilisation doit être hyper fluide et simple. Le cas d'usage principal est l'assignation d'une simple Todo list à un collaborateur, qui se contente de la remplir et de la cocher. Ne crée pas une usine à gaz de gestion de projet.
3. **Sécurité et Chiffrement** : Utilise `prisma-field-encryption` côté backend pour chiffrer les champs sensibles (comme le titre et la description des tâches) au repos dans la base de données. Applique une validation stricte avec Zod sur toutes les entrées.

## 🛠️ Plan de travail attendu

1. **Backend (Base de données)** : 
   - Modifie `schema.prisma` pour ajouter le modèle `Task` (avec relations User, Space, Organization) et ajoute le support des modules actifs dans `Organization`.
   - Exécute les migrations et génère le client.
2. **Backend (Routes & API)** : 
   - Crée le routeur et les contrôleurs pour la gestion des tâches.
   - Implémente le middleware qui vérifie l'activation du module Todo.
3. **Frontend (Store & UI)** : 
   - Mets à jour le store Pinia pour supporter l'état activé/désactivé du module.
   - Crée les composants Vue.js (vues Globale et Contextuelle) en mode asynchrone.
4. **Frontend (Intégration)** : 
   - Ajoute la vue globale "Mes Tâches" dans la Navbar principale.
   - Ajoute l'onglet "Tâches" dans la vue d'un Espace.

**Rappel :** Tu dois respecter les standards du projet (TypeScript strict sans `any`, Vue 3 Composition API, et commits atomiques sans jamais pusher).

À la fin de la session, n'oublie pas de mettre à jour le `vibe/session_log.md`.

Bon courage ! 🚀
