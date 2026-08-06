# 📝 Feature : Onglet "Base de données Notion" dans les Espaces

**Objectif** : Afficher un tableau ou une liste de tâches Notion directement comme un outil natif à l'intérieur d'un Espace de travail Synco.

## 🎯 Expérience Utilisateur (UX)
- Dans un Espace Synco (au même niveau que les Discussions, Fichiers, etc.), il est possible d'ajouter un onglet "Notion".
- Un administrateur de l'Espace sélectionne la base de données Notion de l'entreprise à lier (ex: Board Kanban Produit).
- Tous les membres de l'espace voient le contenu de la base de données s'afficher de manière totalement native et intégrée au design Synco.
- Synchronisation bidirectionnelle basique (ex: modifier le statut d'un ticket depuis Synco met à jour Notion).

## 🛠️ Implémentation via l'API
- **Lecture des données** : Utilisation de `POST /v1/databases/{database_id}/query` pour récupérer les lignes.
- **Mise à jour** : Utilisation de `PATCH /v1/pages/{page_id}` pour modifier les propriétés d'une ligne au clic.
- **Complexité & Attention** : C'est la feature la plus complexe techniquement car elle nécessite de recréer un mappage visuel complet des différents types de propriétés Notion (Select, Multi-select, Date, Personne, etc.) avec des composants UI Vue.js de Synco.
