# V4U1 — CSP désactivée dans l'arbre de travail

|  |  |
|---|---|
| **Sévérité** | 🟡 Moyenne (si elle avait été commitée) |
| **Référentiel** | OWASP ASVS 4.0.3 V14.4.3 (Content-Security-Policy) |
| **CWE** | CWE-1021 / CWE-79 (défense en profondeur contre l'injection de script) |
| **Fichiers** | [`index.html`](../../index.html) |
| **Statut** | ✅ Corrigé (`dc650c2`) |

---

## Description

La balise `<meta http-equiv="Content-Security-Policy">` d'`index.html` était mise en commentaire dans l'arbre de travail
de `feat/e2ee-v4-extension-ux`, pour le développement. Rien n'était encore commité, mais un `git add index.html` ou un
`git commit -a` l'aurait livrée.

Le coffre Synco Extension n'a de sens que face à un script hostile dans la page (spec de l'extension, A1). Sans CSP,
un XSS n'a plus aucune barrière pour charger du code distant et ouvrir l'invite de l'extension (M2) ou lire le coffre
PIN local.

## Correction

CSP rétablie à l'identique de celle de `src-tauri/tauri.conf.json`. Le build de production a été vérifié : aucun
`localhost:*`, aucun emplacement `__…__` restant dans la balise. En développement, `devLanCspPlugin` ajoute déjà
`http(s)://localhost:*` et `ws(s)://localhost:*` : si une ressource de dev est bloquée, il faut l'ajouter par ce biais
plutôt que de retirer la CSP.
