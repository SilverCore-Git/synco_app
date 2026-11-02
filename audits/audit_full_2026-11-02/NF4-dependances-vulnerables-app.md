# NF4 — Dépendances vulnérables côté client : Capacitor (critique), DOMPurify, socket.io-parser, protobufjs

|  |  |
|---|---|
| **Sévérité** | 🟡 Moyenne |
| **OWASP** | A06:2021 — Vulnerable and Outdated Components |
| **CWE** | CWE-1395 — Dependency on Vulnerable Third-Party Component |
| **Fichiers** | [`package.json`](../../package.json) · `bun.lock` / `package-lock.json` · [`capacitor.config.ts:18-20`](../../capacitor.config.ts) |
| **CVSS 3.1 (estimé)** | 6.1 — `AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:L/A:N` (pire cas Capacitor, applicabilité à confirmer) |
| **Statut** | ⚠️ `bun audit --prod` du 02/11/2026 — **68 vulnérabilités (4 critiques, 29 hautes, 24 moyennes, 11 basses)** ; exploitabilité non démontrée |

---

## Description et localisation

Les correctifs FX7 (01/10) ont mis à jour `pdfjs-dist`, `dompurify` et `vite`. De nouveaux avis sont parus depuis :

| Paquet | Version | Avis | Pertinence pour Synco |
|---|---|---|---|
| `@capacitor/android`, `@capacitor/ios` | 8.5.0 | **Critique** GHSA-rvm3-566m-v7fv — contenu distant chargeable à l'origine de l'app via le chemin du proxy HTTP interne | Applications mobiles. `CapacitorHttp.enabled = false` (correctif FX4), mais l'avis vise le chemin du proxy interne lui-même : à vérifier. Si l'avis s'applique, un contenu distant s'exécute avec l'origine de l'app (accès aux jetons, aux clés en mémoire, aux plugins natifs). |
| `dompurify` | 3.4.16 | **Critique** GHSA-cg2g-xh64-v4q7 (`SAFE_FOR_TEMPLATES` + shadow root), haute GHSA-mrv2-3pqr-j5jr (`IN_PLACE` + hook) | Synco n'utilise ni `SAFE_FOR_TEMPLATES` ni `IN_PLACE` (`MarkdownRender.vue`, `SimpleMarkdown.vue`) : **non exploitable en l'état**, mais c'est le seul rempart des deux seuls `v-html` de l'app. |
| `socket.io-parser` | 4.2.5 | GHSA-2m8v-j782-fhvr, GHSA-677m-j7p3-52f9 — épuisement mémoire | Côté client, un serveur malveillant peut faire planter l'onglet. Faible. |
| `protobufjs` | 6.11.6 / 7.6.5 | **Critique** GHSA-xq3m-2v4x-88gg (exécution de code), injection de code par valeurs par défaut | Transitif (Firebase). Atteignable seulement si l'app parse des définitions protobuf contrôlées par un tiers : peu probable. |
| `undici` | 6.19.7 | contournement de validation TLS (GHSA-2m5v-pch6-74hx), DoS WebSocket | Outillage / Tauri ? À vérifier selon l'arbre exact. |
| `@vue/server-renderer`, `postcss`, `vite`, `sharp`, `esbuild` | — | XSS SSR, lecture de fichiers, … | Chaîne de build ou SSR non utilisé : faible, sauf compromission de la machine de build. |

## Impact

- Pire cas (Capacitor, si applicable) : exécution de script distant à l'origine de l'application mobile, donc vol des jetons Keycloak, des clés déchiffrées en mémoire et des messages.
- Les autres avis sont surtout des DoS côté client ou concernent la chaîne de build.

## Recommandation de remédiation

1. Mettre à jour en priorité `@capacitor/core`, `@capacitor/android` et `@capacitor/ios` (≥ 8.5.1), puis reconstruire et republier les binaires mobiles.
2. `dompurify` à la dernière 3.x ; `socket.io-client` (qui tire `socket.io-parser` ≥ 4.2.7) ; régénérer `bun.lock` et `package-lock.json`. Les **deux** lockfiles coexistent et peuvent diverger : n'en garder qu'un.
3. Ajouter `bun audit --prod --audit-level=high` en CI (workflow `Release on main`), bloquant pour les avis atteignables.
