# Guide des Modules Synco

L'architecture de Synco repose sur un système de modules activables/désactivables, permettant d'offrir une expérience modulaire aux organisations (par exemple, activer ou non les Tâches, les Fichiers, l'IA, ou l'intégration Notion).

Ce guide s'adresse aux développeurs et aux agents IA (comme Synco AI) qui doivent intégrer de nouveaux modules dans le futur.

## 1. Principes de Base du Système de Modules

Chaque organisation possède deux champs dans la base de données liés aux modules :
- **`features` (Array of Strings)** : Géré par les **Administrateurs du serveur** (Admin Panel). Il définit quels modules l'organisation a *le droit* d'utiliser.
- **`activeModules` (JSON Object)** : Géré par les **Propriétaires de l'organisation** (Settings de l'Organisation). Il permet d'activer ou désactiver les modules *parmi ceux autorisés* par `features`.

## 2. Étapes pour créer un nouveau module

### Étape 1 : Interface Administrateur (Admin Panel)
Fichier : `synco_app/src/views/admin/OrgsQuota.vue`

1. Ajouter le module dans l'objet initial `orgEditForm.features` (par défaut `true` ou `false`).
2. Ajouter le toggle (bouton) dans le HTML du formulaire d'édition de l'organisation pour permettre à l'administrateur de cocher la fonctionnalité.
3. Modifier le parsing des données existantes (`openOrgEditModal`) pour inclure le chargement du module depuis la base : `nouveau_module: org.features?.includes('nouveau_module') ?? false`.
4. Modifier l'envoi (`saveOrgQuotas`) pour pousser le nom du module dans `featuresArray` si le toggle est activé.

### Étape 2 : Paramètres de l'Organisation (GeneralSettings)
Fichier : `synco_app/src/views/OrgSpace/views/settings/views/GeneralSettings.vue`

1. Ajouter la variable du module (ex: `nouveauModuleEnabled`) dans `orgData`.
2. Calculer sa valeur initiale en vérifiant si le module est à la fois dans `features` ET activé dans `activeModules`. Exemple :
   `nouveauModuleEnabled: openedOrg.value?.features?.includes('module_name') ? (openedOrg.value?.activeModules?.module_name !== false) : false`
3. Créer un composant cliquable dans la section "Modules & Fonctionnalités" :
   - Vérifier l'autorisation via `openedOrg?.features?.includes('module_name')`.
   - Si non autorisé, griser la section et empêcher le clic.
4. Mettre à jour `activeModules` dans la base de données en incluant le nouveau module lors de l'enregistrement (`saveSettings`).

### Étape 3 : Variable Globale (Helper)
Fichier : `synco_app/src/assets/var.ts`

Créer un `computed` pour rendre l'état du module facilement accessible dans toute l'application :
```ts
export const isNouveauModuleEnabled = computed(() => {
    if (!openedOrg.value?.features?.includes('module_name')) return false;
    return openedOrg.value.activeModules?.module_name !== false; 
});
```
Exporter ensuite `isNouveauModuleEnabled` à la fin du fichier.

### Étape 4 : Gestion Conditionnelle de l'Interface Utilisateur (UI)

Une fois la variable globale créée, importez-la dans vos composants (par exemple `ThreadsBar.vue`, `UserSettings.vue`) pour masquer ou afficher le contenu conditionnellement avec `v-if="isNouveauModuleEnabled"`.

### Étape 5 : Limitation des Outils IA
Fichier : `synco_app/src/services/AITools.ts` ou backend correspondant.

Si le module inclut des "outils" pour Synco AI (comme `create_notion_page`), il faut empêcher l'IA d'y avoir accès quand le module est désactivé.
Importez `isNouveauModuleEnabled` depuis `var.ts` et filtrez dynamiquement le tableau d'outils (`availableTools`) lors de la génération du System Prompt.

## 3. Checklist de Déploiement

- [ ] L'Admin peut autoriser/interdire le module globalement pour une organisation.
- [ ] Le propriétaire de l'organisation peut l'activer/désactiver dans ses paramètres.
- [ ] L'UI du module disparaît complètement s'il est désactivé.
- [ ] L'Agent IA ne propose plus d'outils liés au module si celui-ci est désactivé.
