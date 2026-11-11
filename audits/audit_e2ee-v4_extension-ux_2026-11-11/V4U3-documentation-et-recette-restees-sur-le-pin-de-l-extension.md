# V4U3 — §16 et recette restées sur le PIN de l'extension

|  |  |
|---|---|
| **Sévérité** | 🔵 Info |
| **Fichiers** | [`doc/securite/13-e2ee-v4-multi-appareil.md`](../../doc/securite/13-e2ee-v4-multi-appareil.md) §16 · [`doc/securite/13-e2ee-v4-recette-extension.md`](../../doc/securite/13-e2ee-v4-recette-extension.md) |
| **Statut** | ✅ Corrigé (`b5d4f5b`) |

---

## Description

Synco Extension est passée au format 2 (accord « Autoriser », plus de PIN ; spec de l'extension §16, M2, M10, M12b).
Les textes de l'application ont suivi (« Sans code, clés hors de la page »), pas la documentation :

- §16.1 et §16.5 décrivaient la saisie du PIN dans la fenêtre de l'extension, et justifiaient le déverrouillage
  automatique par « le PIN reste à saisir » ;
- §16.6 affirmait qu'« Annuler côté page ne ferme pas la fenêtre de l'extension », alors que l'opération `cancel` existe
  et est utilisée ;
- la recette manuelle faisait saisir le PIN deux fois, tester 10 mauvais PIN, etc.

Une recette jouée sur cette base aurait produit de faux écarts, et la limite nouvelle (un clic suffit : un XSS peut
ouvrir l'invite, une personne devant la session ouverte peut l'accepter) n'était pas écrite côté application.

## Correction

§16 et recette réécrits pour le parcours « Autoriser » ; les cas du format 1 (PIN demandé une dernière fois, compteur,
effacement au 10ᵉ échec) sont isolés (E16–E19). La limite « un clic suffit » est ajoutée à §16.6.
