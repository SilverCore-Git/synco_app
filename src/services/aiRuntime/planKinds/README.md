# planKinds : contrat d'un kind de plan d'action

1. Un kind = un fichier `planKinds/<domaine>.<action>.ts` ; aucun autre fichier partagé à modifier (le glob de `index.ts` le prend).
2. `export default` un `PlanKindExecutor` (`registry.ts`) : `kind`, `execute(args, planHeader, orgId)` qui rend `{ id, spaceId? }`.
3. `schema` (`ArgsSchema`, comme `KIND_SCHEMAS`) est OBLIGATOIRE pour que `validatePlan` admette le kind ; sans lui : `plan_kind`. `tool` : l'outil de l'agent qui le propose ; le kind n'est admis que si cet outil est au manifeste et non `deny` pour l'org (`PlanContext.availableTools`).
4. `exports` : champs utilisables par `argsRefs` (défaut `['id']`). `label(args)`, `chip(n)`, `icon`, `title` : intitulé, puce, icône, nom dans « Toujours accepter ».
5. `clientTools` : outils client hors plan `{ name, label, icon, run(args, { orgId }) }`, appelés par `executeClientTool` (OrgAI) et libellés par `toolLabel` ; recoupe tout id du modèle avec `orgId` (celui de la conversation).
6. Refus local avant envoi : lever `DeviceNotSentError(code)` (action `failed`). Après envoi, toute autre erreur = `unknown_outcome`.
7. Charger `fileActions`, sockets, crypto par `await import()` dans `execute`/`run` : le module doit rester importable sous `bun test`.
8. `import.meta.glob` n'existe pas sous bun : le registre est vide en test ; injecter `setPlanKindModules({ './x.ts': { default: exec } })`.
9. Un kind non déclaré reste refusé ; les kinds historiques (`DEVICE_KINDS`, `ACTION_KINDS`) gardent leur code, ne les migre pas.
10. Tests dans `planKinds/*.test.ts` (exclus du glob) ; mets les parties pures dans un module séparé (ex. `fileTextCodec.ts`).
