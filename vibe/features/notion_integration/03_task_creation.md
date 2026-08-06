# 📝 Feature : Création de Tâche Notion depuis Synco

**Objectif** : Transformer une discussion (ou un message pertinent) en action concrète dans Notion, sans quitter le chat Synco.

## 🎯 Expérience Utilisateur (UX)
- L'utilisateur fait un Clic droit (ou ouvre le menu 3 petits points) sur un message Synco.
- Il sélectionne l'action "Ajouter à Notion" (ou "Créer une Tâche").
- Une petite modale native à Synco s'ouvre, lui permettant de :
  1. Sélectionner la base de données Notion de destination.
  2. Modifier le titre (par défaut, un extrait du message).
  3. Le contenu du message devient automatiquement le corps (description) de la tâche Notion.

## 🛠️ Implémentation via l'API
- **Lecture des destinations** : Le frontend récupère la liste des bases de données disponibles pour l'utilisateur via `POST /v1/search` (en filtrant sur `object: database`).
- **Création de l'entité** : Utilisation de l'endpoint `POST /v1/pages` de l'API Notion.
- Envoi des données (titre, corps du message, ID de la base de données) au backend Synco qui se charge de forger et d'authentifier la requête vers Notion.
