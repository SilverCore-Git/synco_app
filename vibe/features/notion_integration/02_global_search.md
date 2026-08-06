# 📝 Feature : Recherche Hybride Sémantique Synco x Notion

**Objectif** : Enrichir la recherche sémantique hybride d'un Workspace (Espace) Synco en y intégrant les résultats des documents Notion.

## 🎯 Expérience Utilisateur (UX)
- Lorsque l'utilisateur effectue une recherche sémantique dans son Workspace, les documents Notion pertinents remontent au même titre que les messages et fichiers Synco.
- Les résultats sont triés par pertinence et affichent un tag ou une icône spécifique "Notion" pour différencier la provenance.
- En cliquant sur un résultat Notion, l'utilisateur est redirigé vers le document d'origine.

## 🛠️ Implémentation via l'API
- Le backend Synco interroge l'API Notion (`POST /v1/search`) en parallèle de la recherche dans la base de données vectorielle locale.
- *Amélioration Sémantique (Option)* : Pour une vraie recherche sémantique (compréhension du sens), il faudrait soit utiliser un endpoint RAG de Notion (si disponible), soit indexer (vectoriser) le texte des pages Notion autorisées dans la base de données vectorielle locale de Synco.
- Les résultats des deux sources (Synco + Notion) sont fusionnés et renvoyés au client.
