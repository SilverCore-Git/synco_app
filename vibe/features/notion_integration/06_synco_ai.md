# 📝 Feature : Synco AI x Notion (Intégration IA)

**Objectif** : Permettre à l'assistant local Synco AI de lire, comprendre et interagir avec les documents Notion de l'entreprise.

## 🎯 Expériences Utilisateur (UX)

### 1. RAG (Génération Augmentée par la Recherche)
- L'utilisateur pose une question complexe dans le chat (ex: "Quelles sont les étapes de release du projet Alpha ?").
- Synco AI cherche sémantiquement dans les historiques de messages Synco ET dans les pages Notion de l'entreprise.
- L'IA synthétise une réponse naturelle et cite ses sources (ex: *Source: Page Notion "Roadmap Alpha"*).

### 2. Résumé de document (Summarization)
- Lorsqu'un utilisateur partage un long document Notion dans le chat, un bouton "Résumer avec IA" apparaît.
- L'IA lit le contenu de la page Notion (récupéré via l'API) et affiche un résumé en 3 points clés, évitant à toute l'équipe de devoir lire la page entière pour saisir le contexte.

### 3. Création intelligente (Tool Calling)
- Après une longue discussion de brainstorming dans un thread, l'utilisateur demande : "@SyncoAI, crée un ticket Notion avec les actions décidées".
- Synco AI utilise sa capacité de *Tool Calling* pour formater proprement le titre, extraire la todo-list de la discussion, et déclenche l'API Notion pour créer la page au bon endroit, sans intervention manuelle.

## 🛠️ Implémentation
- **Lecture (RAG/Résumé)** : Le backend sert de proxy pour récupérer le contenu Notion via l'API, le texte est passé au worker IA local de Synco.
- **Action (Tool Calling)** : Ajouter un nouvel outil `createNotionPage` aux capacités du système de Tool Calling (Mistral/Ministral) que nous avons déjà optimisé dans Synco. Le worker générera le payload JSON structuré que le backend enverra à Notion.
