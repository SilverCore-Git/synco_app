# Guide du Développeur - Synco

Bienvenue dans l'équipe de développement de Synco ! Ce document rassemble les conventions et règles de base à respecter pour garantir un code propre, cohérent et facile à maintenir pour tout le monde.

## 🛠 Stack Technique Principale

Notre frontend repose sur trois piliers modernes :
- **Vue.js 3 (Composition API & `<script setup>`)** : Pour la construction de nos interfaces de manière réactive.
- **TypeScript** : Pour un code robuste, typé, et auto-documenté. Tous les nouveaux fichiers doivent être en `.ts` ou `<script lang="ts">`.
- **TailwindCSS** : Pour la gestion de notre style via des classes utilitaires directement dans nos templates.

## 🧩 Composants : Réutiliser plutôt que recréer

Avant de développer un nouvel élément d'interface (boutons, champs de texte, popups, barres de navigation, modales de confirmation) :
1. **Fouillez dans la base de code existante** (notamment dans `src/components/` ou les dossiers `common`).
2. **Utilisez les composants existants** pour assurer une harmonie globale.
3. Si le composant a besoin d'une variante, privilégiez l'ajout d'une `prop` (ex: `variant="danger"`) plutôt que la duplication du code.

## 🌗 Thème Clair / Sombre : L'importance des Variables CSS

Synco supporte nativement un thème clair et un thème sombre. Pour que cette bascule fonctionne de manière transparente et sans alourdir le code :
- **Utilisez toujours les variables CSS globales** fournies dans notre système (souvent mappées dans Tailwind).
- Par exemple, utilisez les couleurs définies comme `bg-(--bg)`, `text-(--text)`, `border-(--border-color)`, `text-(--primary)`.
- **Évitez la classe `dark:` de Tailwind** autant que possible. Le changement de couleur doit se faire à la racine via le changement des variables CSS, et non pas en doublant chaque classe couleur de son équivalent `dark:`.

## ✨ Cohérence UI et Qualité UX

La qualité de l'expérience utilisateur (UX) n'est pas négociable. Une interface Synco doit être premium, rapide et intuitive :
- **Cohérence des espaces et du design** : Gardez les mêmes arrondis (`rounded-xl` par exemple), les mêmes ombres et les mêmes espacements pour des éléments de même nature.
- **Feedback instantané** : Chaque bouton cliqué, chaque action asynchrone doit avoir un retour visuel (état `hover`, `active`, désactivation du bouton pendant la requête avec un loader, notifications Toast).
- **Animations douces** : Appliquez des transitions sur les couleurs (`transition-colors`) et des animations fluides d'apparition (les modales ou listes déroulantes ne doivent pas "poper" agressivement).
- **Accessibilité & Focus** : Assurez-vous que l'état `focus` des inputs est bien visible et que la navigation logique est conservée (ex: autofocus sur un input lors de l'ouverture d'une popup).

## 📝 Conventions générales et Architecture du Code
- **Typage Strict (TypeScript)** : Tout le code doit être strictement typé. Fuyez l'utilisation de `any`. Déclarez des interfaces ou des types explicites pour vos objets, props et retours d'API.
- **Séparation des responsabilités (Pas de code spaghetti)** : Évitez les composants Vue surchargés de logique métier (les fameux fichiers de 1000 lignes). Extrayez la logique réutilisable ou complexe dans des **Composables** (`src/composables/`) et les fonctions pures dans des **Utils** (`src/utils/`).
- **Nommage** : Nommez vos variables et fonctions de manière explicite (en anglais dans le code source).
- **Découpage des vues** : Découpez vos vues complexes en de plus petits sous-composants dédiés à l'affichage.
- **Gestion des erreurs** : Gérez systématiquement les états d'erreurs (catch) des appels API pour informer l'utilisateur via un toast si quelque chose tourne mal.

Bon dev et bienvenue à bord ! 🚀
