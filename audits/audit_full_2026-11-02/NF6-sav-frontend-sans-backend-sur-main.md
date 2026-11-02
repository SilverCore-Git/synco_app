# NF6 — Module SAV (tickets chiffrés) livré sur `main` côté app sans son API : inventaire incohérent, crypto non auditable de bout en bout

|  |  |
|---|---|
| **Sévérité** | 🔵 Info |
| **OWASP** | API9:2023 — Improper Inventory Management · A04:2021 — Insecure Design |
| **CWE** | CWE-1059 — Insufficient Technical Documentation |
| **Fichiers** | [`src/services/support/api.ts:59`](../../src/services/support/api.ts) (`BASE = '/api/support'`) · [`src/assets/utils/supportCrypto.ts`](../../src/assets/utils/supportCrypto.ts) · [`src/composables/useStaffKey.ts`](../../src/composables/useStaffKey.ts) · [`src/composables/useStaffKeyAdmin.ts`](../../src/composables/useStaffKeyAdmin.ts) · [`src/router.ts:87`](../../src/router.ts) |
| **CVSS 3.1** | — |
| **Statut** | ⚠️ constaté le 02/11/2026 — `grep -rn "support" synco_api/src` ne trouve aucune route `/api/support` sur `main` |

---

## Description et localisation

Le commit `5dcfc4e` (« *Ajoute la création et l'ouverture de ticket chiffrées, useSupportRole et useStaffKey* ») a fusionné sur `main` côté app un module SAV complet :

- clé d'équipe RSA-OAEP 4096 signée par le super-admin (ECDSA FC4), dont la clé privée est scellée pour chaque membre de l'équipe ;
- clés de ticket AES-GCM par canal (PUBLIC / INTERNAL), scellées pour le créateur et/ou la clé d'équipe ;
- garde de route s'appuyant sur `GET /api/support/me`.

Côté API, ces routes n'existent pas sur `main` (elles vivent vraisemblablement sur `feature/sav`). Les appels renvoient donc 404 en production, et les deux dépôts publient des versions incompatibles.

## Impact

- Pas de vulnérabilité exploitable aujourd'hui : les routes absentes échouent fermé.
- Le protocole cryptographique du SAV **n'a pas pu être audité de bout en bout**. Il faudrait les contrôles serveur suivants : qui peut lire un ticket INTERNAL, qui peut remplacer la clé d'équipe, qui peut se déclarer membre de l'équipe support, comment la rotation révoque un ancien agent.
- Points à surveiller au moment de la fusion côté API :
  1. le rôle support doit être attribué **côté serveur uniquement** (pas via `User.data`, voir [NA9 côté API](../../../synco_api/audits/audit_full_2026-11-02/NA9-patch-me-data-libre-contournement-qw11.md)) ;
  2. la clé d'équipe ne doit être acceptée que signée par la clé de signature **épinglée** du super-admin, et non par une clé servie par le serveur au premier contact (même faiblesse TOFU que [NF2](./NF2-enveloppes-de-cles-fc4-verification-fail-open.md)) ;
  3. un ticket doit être lié à son créateur pour éviter la lecture inter-clients (BOLA classique) ;
  4. la rotation de la clé d'équipe au départ d'un agent doit exister (même manque que [NA5 côté API](../../../synco_api/audits/audit_full_2026-11-02/NA5-revocation-sans-coupure-livekit-ni-rotation-des-cles.md)).

## Recommandation de remédiation

- Ne fusionner une fonctionnalité sur `main` que lorsque ses deux moitiés sont prêtes, ou la masquer derrière un *feature flag* serveur.
- Programmer un audit ciblé du SAV au moment de la fusion de `feature/sav` côté API.
