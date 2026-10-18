# 🤖 Synco AI Agent Rules (Vibe Coders)

> **CRITICAL**: All AI agents MUST read and follow these rules before taking any action in this repository.

## 1. Context Initialization
Before writing any code or making any changes:
1. **Read `vibe/guide.md`**: Understand the architecture, conventions, and security rules.
2. **Read `vibe/session_log.md`**: Check the latest entries to understand the current state and recent changes.
3. **Check `vibe/features/`**: If working on a specific feature, read its specification file (e.g., `WEBHOOKS_FEATURE.md`).

## 2. Core Directives
- **Security First**: The project uses E2EE. Never compromise security for convenience.
- **Strict TypeScript**: ZÉRO `any`. Always use and define proper types.
- **No Git Pushing**: You may `git commit`, but you must **NEVER** `git push` to a remote repository.
- **Atomic Commits**: Make small, logical commits with conventional commit messages (e.g., `feat: ...`, `fix: ...`).

## 3. Session Logging (Long-Term Memory)
At the end of your session, you **MUST** document your work to maintain the long-term memory for future AI agents:
1. Open `vibe/session_log.md`.
2. Append a new entry at the bottom using the template found in `vibe/templates/session_template.md`.
3. Include all files created/modified, functionalities implemented, the commit hash/message, and next steps.

## 4. Feature Planning
When starting a new major feature:
1. Create a markdown specification in `vibe/features/[FEATURE_NAME]_FEATURE.md`.
2. Document the architecture, API endpoints, components, and security considerations before implementation.

## 5. E-mails : toujours la charte graphique Synco
Tout e-mail rédigé (e-mail envoyé par l'API, modèle, ou mail à envoyer à quelqu'un) **DOIT** être stylisé avec la charte graphique Synco — **jamais** un e-mail en texte brut.
- Utiliser la coque commune `synco_api/src/services/emailLayout.ts` : `renderShell()`, `ctaButton()`, `preheader()`, couleurs `BRAND` (`#16ac77`), `BRAND_DARK` (`#0d7551`), `BRAND_DEEP` (`#062d1f`) et `TONES`.
- Mise en page en `<table>` avec styles inline (compatibilité Outlook/Gmail), bandeau d'en-tête Synco, bouton d'action aux couleurs de la marque.
- Tout texte dynamique passe par `escapeHtml()` (ou `renderMarkdownEmail()` pour du markdown).
