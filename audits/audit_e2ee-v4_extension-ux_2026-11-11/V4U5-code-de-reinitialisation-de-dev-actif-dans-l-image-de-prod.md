# V4U5 — Code de réinitialisation de dev actif dans l'image de production

|  |  |
|---|---|
| **Sévérité** | 🟠 Haute |
| **Référentiel** | OWASP ASVS 4.0.3 V14.1.1 (build sans code de debug) · V2.5 (récupération de compte) |
| **CWE** | CWE-489 — Active Debug Code |
| **Fichiers** | `synco_api/src/services/pinSecurityService.ts` (`DEV_RESET_CODE`) · `synco_api/Dockerfile` (stage `build`) |
| **Statut** | ✅ Corrigé sur `feat/e2ee-v4` par le merge de `main` (synco_api `1abcc5c`, apporte `31527eb`) |

---

## Description

`2ee6a85` (branche `feat/e2ee-v4`) accepte le code `454545` pour valider une réinitialisation du chiffrement sans
e-mail, « seulement si `process.env.NODE_ENV === 'development'` ». Mais `bun build` remplace `process.env.NODE_ENV` par
sa valeur **au moment du build**, et le stage `build` du Dockerfile de la branche ne la fixait pas : elle valait
`"development"`. Le `ENV NODE_ENV=production` du stage `prod` arrive trop tard.

Vérifié en compilant la branche comme l'image : sans `NODE_ENV`, le bundle contient
`var …="454545";async function …(i,x){if(x===…){…` (garde supprimée, code toujours actif) ; avec
`NODE_ENV=production`, le code disparaît du bundle.

## Impact

Avec une simple session Keycloak volée, un attaquant pouvait réinitialiser le chiffrement d'un compte v4 sans accès à
sa boîte mail : historique perdu pour l'utilisateur, puis initialisation de sa propre identité (cf. V4A2). Le même
défaut de build désactivait aussi d'autres branches « production » de l'API (erreurs détaillées, garde SSRF, contrôle
des variables requises).

## Correction

Le correctif existait sur `main` (`31527eb`, `ENV NODE_ENV=production` dans le stage `build`) mais pas sur la branche.
`main` a été fusionnée dans `feat/e2ee-v4` (synco_api `1abcc5c`). Recommandation complémentaire : ne pas dépendre
d'une valeur figée au build pour une porte de dev ; lire l'environnement à l'exécution, ou retirer le code des builds
de production.
