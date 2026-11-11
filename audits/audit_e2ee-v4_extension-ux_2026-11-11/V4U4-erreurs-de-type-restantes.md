# V4U4 — Quatre erreurs de type restantes

|  |  |
|---|---|
| **Sévérité** | 🔵 Info |
| **Fichiers** | `src/App.vue:464` · `src/assets/utils/fileKeyV3.ts:45,53` · `src/views/OrgSpace/views/ChatView.vue:680` |
| **Statut** | ⏳ Ouvert |

---

## Description

`vue-tsc -b` (sous Node, via l'hôte) signale 4 erreurs (même nombre que lors de l'audit du 18/10, qui les jugeait antérieures à la branche ; elles datent en fait du 17/10, sur la branche). Aucune ne touche le chiffrement
v4 et aucune n'a d'effet à l'exécution :

- `App.vue` : `labels[next]` typé `string | undefined` ;
- `fileKeyV3.ts` : `Uint8Array<ArrayBufferLike>` passé à `crypto.subtle` (typage TypeScript 5.7+) ;
- `ChatView.vue` : `setCachedPlaintext(…, auth)` reçoit `'legacy'`, absent du type du cache. À l'exécution l'état est
  bien conservé ; c'est le type de `dmPlaintextCache.ts` qui est trop étroit.

`vite build` n'effectue pas de type-check : ces erreurs ne bloquent pas la publication, mais elles masquent toute
nouvelle erreur dans la sortie. À corriger dans un commit séparé.
