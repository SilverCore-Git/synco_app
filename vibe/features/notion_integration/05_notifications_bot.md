# 📝 Feature : Bot de Notifications Notion

**Objectif** : Centraliser les alertes. Recevoir une notification directement dans Synco lorsqu'on est mentionné ou qu'une tâche nous est assignée sur Notion.

## 🎯 Expérience Utilisateur (UX)
- L'utilisateur possède un canal DM automatique nommé "Notion Bot" dans Synco.
- Lorsqu'une tâche lui est assignée dans le Notion de l'entreprise ou qu'un collègue le mentionne dans un commentaire, le bot envoie instantanément un message dans Synco.
- Le message contient le contexte et un lien direct vers la page Notion concernée.

## 🛠️ Implémentation et Limites de l'API
- L'API de Notion ne possède pas (à l'heure actuelle) de système de Webhooks natif complet et ouvert pour écouter tous les événements en temps réel.
- **Solutions de contournement envisagées** :
  1. **Polling** : Un `Cron job` sur le backend Synco vérifie toutes les `X` minutes si des éléments ont été mis à jour dans les bases de données importantes via l'API. (Assez lourd pour le serveur).
  2. **Intégration Tierce** : Fournir une URL de Webhook entrante personnalisée dans Synco (`POST /api/webhooks/notion/{user_id}`) que les administrateurs peuvent brancher depuis des outils comme Make/Zapier pour déclencher l'envoi de messages de la part du Bot.
