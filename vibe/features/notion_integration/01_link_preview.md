# 📝 Feature : Aperçu de Liens Notion (Link Unfurling)

**Objectif** : Transformer les liens Notion copiés-collés dans le chat en cartes interactives enrichies.

## 🎯 Expérience Utilisateur (UX)
- L'utilisateur colle un lien `https://notion.so/...` dans le chat.
- Synco affiche une belle carte native (Titre de la page, Icône, Statut/Extrait).
- Au clic sur la carte, la page s'ouvre dans un nouvel onglet.

## 🛠️ Choix Technique : 100% API Notion (Pas d'iframe)
Comme défini, nous privilégions l'API Notion pour construire la UI nous-mêmes :
- Les iframes sont bloquées par Notion pour les pages privées (d'entreprise).
- Utiliser l'API permet d'avoir un rendu UI totalement intégré au thème (clair/sombre) de Synco avec les mêmes arrondis et ombres.
- Le backend Synco récupère les données via `GET /v1/pages/{page_id}` avec le token OAuth de l'utilisateur, puis transmet les métadonnées au frontend.
- Le frontend utilise un composant dédié `NotionLinkPreview.vue`.

## 🔒 Sécurité
- Le token Notion de l'utilisateur est stocké chiffré dans la BDD PostgreSQL de Synco (`prisma-field-encryption`).
- Les requêtes vers Notion se font exclusivement côté serveur (Backend en proxy) pour ne jamais exposer les clés sur le navigateur du client.
