# 🔒 Audit complémentaire — E2EE v4 : Synco Extension et parcours UX — 11 novembre 2026

> **Date** : 11 novembre 2026
> **Scope** : ce qui a été ajouté à la v4 **après** l'[audit du 18 octobre](../audit_pentest_e2ee-v4_2026-10-18/README.md) :
> - branche `feat/e2ee-v4-extension-vault` (coffre Synco Extension, mergée le 20/10) ;
> - branche `feat/e2ee-v4-extension-ux` (extension sans PIN, carte d'attente, déverrouillage automatique, bascule
>   PIN local → extension, réinitialisation depuis les paramètres, écrans refaits) ;
> - CSP (`index.html`, `tauri.conf.json`) ; code de dev de réinitialisation de `synco_api` (`2ee6a85`).
> **Méthode** : revue de code boîte blanche, build de production inspecté, tests et type-check rejoués sur une copie
> propre de la branche (sans les modifications locales non commitées).
> **Auditeur** : Claude Code, à la demande du propriétaire des dépôts.
> **Spécifications** : [`13-e2ee-v4-multi-appareil.md`](../../doc/securite/13-e2ee-v4-multi-appareil.md) §16 ·
> [`synco_extension/doc/16-coffre-extension.md`](../../../synco_extension/doc/16-coffre-extension.md)

Préfixe `V4U` : intégration de l'extension et parcours UX de la v4.

---

## Résumé exécutif

**4 constats : 2 moyens, 2 informatifs. Les 3 premiers sont corrigés ; reste une vérification de configuration de
production (V4U2) et 4 erreurs de type sans effet (V4U4).**

Le canal page ↔ extension tient : aucun chemin trouvé ne fait sortir DK, le PIN local ou une clé de la page, ni ne fait
accepter un faux `ready` venu d'une autre fenêtre ou d'une autre origine. Le passage de l'extension à « Autoriser »
sans PIN ne retire aucune protection côté application (le PIN de l'extension ne transitait jamais par la page) ; il
déplace une limite déjà documentée côté extension (M2, M12b), désormais écrite aussi dans §16.6.

## Constats

| ID | Titre | Sévérité | Statut |
|---|---|---|---|
| [V4U1](./V4U1-csp-desactivee-dans-l-arbre-de-travail.md) | CSP désactivée dans l'arbre de travail | 🟡 Moyenne | ✅ Corrigé (`dc650c2`) |
| [V4U2](./V4U2-origine-du-keyguard-absente-de-la-csp.md) | Origine de synco_keyguard absente de la CSP | 🟡 Moyenne | ✅ Corrigé (`dc650c2`) · ⏳ config prod |
| [V4U3](./V4U3-documentation-et-recette-restees-sur-le-pin-de-l-extension.md) | §16 et recette restées sur le PIN de l'extension | 🔵 Info | ✅ Corrigé (`b5d4f5b`) |
| [V4U4](./V4U4-erreurs-de-type-restantes.md) | Quatre erreurs de type restantes | 🔵 Info | ⏳ Ouvert |

### Constats de l'audit du 18/10 toujours ouverts

| ID | Statut |
|---|---|
| [V4A2](../audit_pentest_e2ee-v4_2026-10-18/V4A2-initialisation-v4-d-un-compte-vierge-par-une-session-volee.md) — initialisation v4 d'un compte vierge par une session volée | ⏳ Ouvert (décision produit) |
| [V4K3](../audit_pentest_e2ee-v4_2026-10-18/V4K3-audience-keycloak-non-imposee-par-le-keyguard.md) — audience Keycloak au keyguard | ⏳ Ouvert : le code gère `KEYCLOAK_AUDIENCE`, à renseigner au déploiement |

## Ce qui a été vérifié et tient

| Contrôle | Où | Résultat |
|---|---|---|
| `hello` envoyé à `location.origin`, jamais `'*'` | `extensionVault.ts` | conforme |
| `ready` accepté seulement si `source === window`, `origin === location.origin`, clés exactes, protocole 1, un seul port ; ports d'une réponse mal formée fermés | `extensionVault.ts`, tests | conforme |
| DK : `ArrayBuffer` de 32 octets exactement, copiée puis tampon reçu effacé, y compris réponse tardive, inconnue ou après annulation | `takeDk`, `wipeResponseKey`, tests | conforme |
| `deviceId` revérifié (UUID) avant tout envoi ; raison nettoyée (contrôle, bidi) et plafonnée à 200 caractères ; `ctx.pin` jamais transmis | `extensionVault.ts`, tests | conforme |
| Codes inconnus → `unavailable` ; messages de l'extension jamais affichés (faux coffre, M7) | `toVaultError`, tests | conforme |
| `cancel` envoyé seulement après un abandon par la page, sans dépendance au résultat | `prompt()` | conforme |
| Déverrouillage automatique borné : onglet visible, une fois par page, rien en cours, pas pendant un blocage, appareil connu | `extensionAuto.ts`, tests | conforme |
| Bascule PIN local → extension : le PIN local ne sert qu'à ouvrir l'ancien coffre ; ancien coffre vidé après écriture du nouveau | `V4Gate.vue`, `switchVault` | conforme |
| Aucune formulation « vérifiée » / « authentique » pour la détection | interface | conforme |
| Aucun `console.*` ne journalise DK, PIN, AK ou clé privée (seulement des objets d'erreur aux messages de l'app ; nom et message WebAuthn pour la passkey) | `deviceVault/`, `e2eeV4/`, `components/e2ee/` | conforme |
| Code de dev `454545` (réinitialisation sans e-mail) : actif seulement si `NODE_ENV === 'development'` ; l'image publiée par la CI (`target: prod`) fixe `NODE_ENV=production` | `synco_api` `pinSecurityService.ts`, `Dockerfile` | conforme (ne jamais lancer la prod avec `NODE_ENV=development`) |
| CSP de production générée : ni `localhost:*`, ni emplacement non résolu | `dist/index.html` | conforme après V4U1 |

## Vérifications

- synco_app (copie propre de la branche) : `bun test` **438 réussis, 0 échec** ; `vue-tsc -b` : 4 erreurs (V4U4) ;
  `vite build` OK.
- synco_api `feat/e2ee-v4` : `bun test` **350 réussis, 5 ignorés, 0 échec**.

## Non testé (navigateur réel requis)

Toute la [recette de l'extension](../../doc/securite/13-e2ee-v4-recette-extension.md) (E01–E61), dans Chrome et Firefox,
et le §13.6 de la spec (parcours sur de vrais appareils) : rien n'y a encore été validé.
