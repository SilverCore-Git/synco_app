# Règles d'utilisation de Git - SilverCore

Ce document définit les règles strictes de gestion de version et d'utilisation de Git pour tous les développeurs travaillant sur les projets SilverCore.

## 1. La branche `main` (Accès Restreint)

- **Seuls les mainteneurs** du dépôt (repository) ont le droit de commiter, de pousser (push) ou de fusionner (merge) directement sur la branche `main`.
- La branche `main` est considérée comme sacrée : elle doit toujours être stable, fonctionnelle et prête pour la production.

## 2. Flux de travail pour les Développeurs

Pour tous les autres développeurs qui ne sont pas mainteneurs, vous devez respecter le flux de travail (workflow) suivant :

### A. Création de votre branche
- Ne travaillez **jamais** directement sur `main`.
- Créez toujours une nouvelle branche à partir de la dernière version de `main` pour isoler vos développements.
- **Convention de nommage des branches** :
  - `feat/...` pour une nouvelle fonctionnalité (ex: `feat/nouveau-dashboard`)
  - `fix/...` pour une correction de bug (ex: `fix/crash-au-login`)
  - `refactor/...` pour de la restructuration de code
  - `docs/...` pour des modifications de documentation
  - `recipe/...` pour des modifications divers / expérimentales (ex: `recipe/pseudo`)

### B. Les Commits
- Faites des **commits atomiques** : un commit doit représenter un seul changement logique et cohérent.
- Écrivez des messages de commit clairs, descriptifs et idéalement en suivant la convention Conventional Commits (ex: `feat(api): ajout de la route de synchronisation`).

### C. Les Pull Requests (PR)
- Une fois votre travail prêt, ouvrez une **Pull Request (PR)** pour fusionner votre branche vers `main`.
- Remplissez correctement la description de la PR en expliquant le contexte, ce qui a été fait, et comment le tester.
- **Seul un mainteneur** pourra relire votre code (Code Review), l'approuver et effectuer le merge sur `main`.

### D. Mise à jour de votre branche
- Si la branche `main` a avancé pendant que vous travailliez, c'est à vous de mettre à jour votre branche (via `git rebase main` ou `git merge main`) et de résoudre les éventuels conflits avant que la PR ne puisse être validée.

---
*Le respect de ces règles est essentiel pour garantir la qualité du code, garder un historique propre et faciliter le travail en équipe chez SilverCore.*
