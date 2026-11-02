# NF5 — CSP : `connect-src` ouvert à des hôtes tiers inscriptibles par n'importe qui (canaux d'exfiltration)

|  |  |
|---|---|
| **Sévérité** | 🟢 Basse |
| **OWASP** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-693 — Protection Mechanism Failure |
| **Fichiers** | [`index.html:25-26`](../../index.html) · [`src-tauri/tauri.conf.json:26`](../../src-tauri/tauri.conf.json) |
| **CVSS 3.1 (estimé)** | 3.1 — `AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N` |
| **Statut** | ⚠️ confirmé par revue de code |

---

## Description et localisation

Le correctif FX5 a retiré `unsafe-eval` et `localhost:*`, ce qui est une nette amélioration. La directive `connect-src` autorise désormais, pour l'IA locale (téléchargement de modèles), plusieurs domaines tiers :

```
connect-src 'self' … https://huggingface.co https://*.huggingface.co https://cdn.jsdelivr.net
            https://raw.githubusercontent.com https://cas-bridge.xethub.hf.co https://*.cdn.hf.co
```

`huggingface.co` expose une API d'écriture (dépôts, discussions, Spaces) où n'importe quel compte gratuit peut recevoir des données : `POST https://huggingface.co/api/…` avec le jeton de l'attaquant. C'est un **canal d'exfiltration autorisé par la CSP**. `cdn.jsdelivr.net` et `raw.githubusercontent.com` servent par ailleurs du contenu arbitraire publié par n'importe qui, ce qui compte si une future directive les réutilise pour `script-src`.

## Impact

La CSP est la deuxième ligne de défense derrière DOMPurify. En cas d'injection réussie (régression du sanitizer, dépendance compromise, extension), elle ne bloque plus l'envoi des clés et des messages déchiffrés vers un compte Hugging Face de l'attaquant. Pas d'exploitation directe aujourd'hui.

## Recommandation de remédiation

1. Restreindre aux chemins réellement utilisés quand c'est possible (CSP niveau 3 : `https://huggingface.co/<org>/<model>/resolve/` ne fonctionne qu'au niveau du chemin, pas de la méthode). Mieux : **faire transiter les modèles par le CDN Synco** (`cdn.synco.one`), avec vérification d'empreinte SHA-256, et retirer les domaines tiers de `connect-src`.
2. Si les domaines tiers restent nécessaires, charger l'IA locale dans un worker ou une iframe isolée avec sa propre CSP. La page principale, qui détient les clés, garde alors `connect-src` limité aux origines Synco.
3. Vérifier l'intégrité des modèles téléchargés (hash épinglé) pour que `raw.githubusercontent.com` ou `cdn.jsdelivr.net` ne puissent pas substituer des poids malveillants.
