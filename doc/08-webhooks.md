# 8. Webhooks

Un **webhook** permet à un outil extérieur à Synco — une chaîne d'intégration continue, une sonde de supervision, un service d'automatisation, un script maison — de poster des messages dans un salon, sans compte utilisateur ni mot de passe.

## Qu'est-ce qu'un webhook ?

C'est une **adresse privée** que vous créez dans Synco et que vous collez dans l'outil extérieur. Tout ce que cet outil envoie à cette adresse s'affiche dans le salon que vous avez choisi, sous le nom et la photo que vous avez donnés au webhook.

Vu depuis le fil de discussion, un webhook ressemble à un membre de l'équipe : il a un nom, une photo de profil, et ses messages apparaissent comme les autres, signalés par une étiquette. Mais ce n'est pas un compte : il ne lit rien, ne rejoint aucun appel, et ne peut rien faire d'autre qu'écrire dans le salon qu'on lui a assigné.

**Le sens de la communication compte** : un webhook Synco *reçoit*. C'est l'outil extérieur qui appelle Synco, jamais l'inverse. Si vous cherchez à faire réagir un service extérieur à ce qui se passe dans Synco, un webhook n'est pas le bon outil.

### Quelques usages courants

- Annoncer dans un salon qu'un déploiement a réussi ou échoué.
- Relayer les commits, tickets et demandes de fusion d'un dépôt GitHub ou GitLab.
- Faire remonter les alertes d'une supervision (Grafana, Zabbix, UptimeRobot).
- Publier un rapport quotidien généré par un script.
- Brancher un service d'automatisation (Zapier, Make, n8n) sur un salon.

## Où gère-t-on les webhooks ?

Deux entrées mènent au même écran :

- **Paramètres de l'organisation → Webhooks** : tous les webhooks de tous les espaces, avec l'espace d'appartenance indiqué sur chaque ligne.
- **Paramètres d'un espace → onglet Webhooks** : uniquement ceux de cet espace.

L'écran est en deux colonnes : la liste à gauche, la configuration du webhook sélectionné à droite. Sur un écran étroit, les deux se relaient et une flèche ramène à la liste.

L'accès demande la permission **ORG_WEBHOOKS**, qui s'accorde par rôle dans *Paramètres → Rôles & Permissions*. Elle se règle espace par espace : un rôle peut gérer les webhooks d'un espace sans toucher à ceux d'un autre.

## Créer un webhook

Le bouton **+** en haut de la liste ouvre un formulaire volontairement court, trois décisions :

1. **La photo de profil** — facultative. Vous choisissez une image, la recadrez, et elle devient l'avatar affiché à côté de chaque message. Sans photo, une pastille est générée à partir du nom.
2. **Le nom affiché** — celui qui apparaîtra dans le fil. Prenez-le descriptif : « Déploiements », « Alertes Grafana », plutôt que « webhook1 ».
3. **Le salon de destination** — où les messages arriveront. Depuis les paramètres de l'organisation, choisissez d'abord l'espace, puis le salon.

Tout le reste part sur des réglages sûrs, modifiables ensuite : le webhook peut envoyer du texte et des cartes enrichies, la signature de sécurité est exigée, le chiffrement de bout en bout est désactivé.

### L'adresse d'envoi et le secret

À la création, Synco affiche deux valeurs **que vous ne reverrez pas en clair** :

- **L'adresse d'envoi**, de la forme `https://api.synco.fr/api/webhooks/<identifiant>/<jeton>`. C'est elle que vous collez dans l'outil extérieur.
- **Le secret**, qui sert à signer les requêtes.

Copiez-les immédiatement. Ensuite, l'adresse n'est réaffichable que par la personne qui a créé le webhook, et le secret plus du tout. Si vous les perdez, régénérez l'adresse (voir plus bas) : vous obtenez un nouveau couple, et l'ancien cesse de fonctionner.

**L'adresse vaut mot de passe.** Quiconque la détient peut poster dans votre salon sous l'identité du webhook. Elle n'a rien à faire dans un dépôt Git, un ticket ou une capture d'écran : rangez-la dans les secrets de votre outil (variables d'environnement, coffre-fort, *repository secrets* GitHub).

## Envoyer un message

L'outil extérieur envoie une requête **POST** à l'adresse, avec un corps JSON et l'en-tête `Content-Type: application/json`.

### Le message le plus simple

```json
{ "content": "Déploiement terminé en 42 s" }
```

### Avec une carte enrichie

```json
{
  "content": "Build #1240",
  "embeds": [
    {
      "title": "Build réussie",
      "description": "Branche main, 2 min 34 s",
      "color": "#22c55e",
      "fields": [
        { "name": "Commit", "value": "a1b2c3d", "inline": true },
        { "name": "Auteur",  "value": "Camille", "inline": true }
      ]
    }
  ]
}
```

### Signer la requête

Par défaut, un webhook **exige une signature** : sans elle, la requête est refusée. C'est ce qui protège votre salon si l'adresse fuite dans un journal de serveur mandataire.

Deux en-têtes sont attendus :

| En-tête | Contenu |
|---|---|
| `X-Synco-Timestamp` | l'horodatage courant en **millisecondes** |
| `X-Synco-Signature` | `t=<horodatage>,v1=<signature>` |

La signature est un **HMAC-SHA256 en hexadécimal**, calculé avec le secret du webhook sur la concaténation `horodatage + corps brut de la requête` — le corps exactement tel qu'il est envoyé, octet pour octet.

En ligne de commande :

```bash
SECRET="le-secret-du-webhook"
URL="https://api.synco.fr/api/webhooks/<identifiant>/<jeton>"
BODY='{"content":"Déploiement terminé"}'
TS=$(date +%s%3N)
SIG=$(printf '%s' "$TS$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')

curl -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H "X-Synco-Timestamp: $TS" \
  -H "X-Synco-Signature: t=$TS,v1=$SIG" \
  -d "$BODY"
```

L'horodatage doit avoir **moins de cinq minutes** : passé ce délai, la requête est refusée même si la signature est juste. C'est ce qui empêche quelqu'un ayant intercepté une requête valide de la rejouer indéfiniment.

Si votre outil ne sait pas signer ses requêtes, vous pouvez désactiver l'exigence dans les réglages avancés du webhook — en sachant que l'adresse devient alors le seul élément qui protège le salon.

### Changer l'identité d'un message

Deux champs facultatifs surchargent, pour un message donné, l'identité du webhook :

```json
{
  "content": "Sauvegarde nocturne terminée",
  "username": "Cron",
  "avatar_url": "https://exemple.fr/cron.png"
}
```

Sans eux, le nom et la photo configurés dans Synco s'appliquent.

### Choisir un autre salon

Un webhook poste dans son salon de destination. Pour viser un autre salon **du même espace**, ajoutez :

```json
{
  "content": "…",
  "_synco": { "targetThreadId": "<identifiant du salon>" }
}
```

Un salon situé dans un autre espace est refusé : un webhook ne sort jamais du sien.

### Formats reconnus automatiquement

Synco reconnaît trois formats et convertit les deux premiers :

- **Discord** — les webhooks écrits pour Discord (`content`, `username`, `avatar_url`, `embeds`) fonctionnent tels quels. C'est le format le plus largement supporté par les outils du marché.
- **GitHub** — les charges utiles GitHub sont transformées en cartes lisibles (pushs, tickets, demandes de fusion, publications). Collez simplement l'adresse Synco dans *Settings → Webhooks* de votre dépôt, en `application/json`. Ajoutez le suffixe `/github` à l'adresse si la détection automatique ne suffit pas.
- **Synco** — le format natif décrit ci-dessus, reconnu à la présence de l'objet `_synco`.

## Configurer un webhook existant

La sélection d'un webhook dans la liste ouvre sa fiche. Les modifications s'y accumulent et une barre en bas propose de les enregistrer.

### Identité

Photo, nom affiché, et une note interne qui ne sert qu'à votre équipe — elle n'apparaît jamais dans le fil. Un aperçu montre le rendu exact du message dans le salon.

### Destination

Le salon où arrivent les messages quand l'outil extérieur n'en précise aucun.

### Adresse d'envoi

L'adresse, masquée par défaut, avec un bouton pour la révéler (réservé à son créateur) et un pour la copier.

**Régénérer l'adresse** produit un nouveau jeton et invalide l'ancien sur-le-champ. À faire si l'adresse a fuité, ou si vous l'avez perdue. Pensez à mettre à jour tous les outils qui l'utilisaient : ils cesseront de fonctionner d'ici là.

### Test

Un champ et un bouton pour poster un vrai message dans le salon de destination, sous l'identité du webhook. C'est le moyen le plus rapide de vérifier qu'un webhook fraîchement configuré arrive au bon endroit. Enregistrez vos modifications avant de tester : le test utilise la configuration enregistrée.

### Activité

Le nombre de messages reçus, le nombre d'erreurs, la date du dernier appel et celle de la création. Un compteur d'erreurs qui grimpe signale en général une signature mal calculée ou un dépassement de quota.

### Réglages avancés

Repliés par défaut, ils regroupent :

**Ce que le webhook a le droit de faire.** Trois autorisations, réellement appliquées à la réception : envoyer des messages (texte), envoyer des cartes enrichies (embeds), joindre des fichiers. Une requête qui dépasse ce qui lui est accordé est refusée. Deux autres autorisations, *se gérer lui-même* et *lire ses statistiques*, sont réservées pour un usage futur et sans effet aujourd'hui.

**Exiger une signature HMAC.** Activé par défaut. Le désactiver fait de l'adresse le seul facteur d'authentification — à ne faire que pour un outil incapable de signer, et de préférence pas pour un salon sensible.

**Chiffrement de bout en bout.** Voir la section dédiée ci-dessous.

**Secret HMAC.** Affiché seulement à la création ; ensuite masqué.

## Mettre en pause, supprimer

Le bouton **Pause** de l'en-tête suspend le webhook : ses requêtes sont refusées, mais sa configuration, son adresse et son historique restent intacts. Pratique pour couper temporairement une intégration trop bavarde sans avoir à la reconfigurer ensuite.

La **suppression** est définitive : l'adresse cesse immédiatement de fonctionner et l'historique des appels est effacé. Les messages déjà postés dans le salon, eux, restent.

## Chiffrement de bout en bout (avancé)

Par défaut, un message webhook arrive en clair sur le serveur Synco, qui le range dans le salon. Avec le chiffrement de bout en bout activé, l'outil extérieur chiffre son message avant l'envoi, et seul le serveur Synco peut le déchiffrer avec sa clé privée.

C'est une option **exigeante** : elle n'a de sens que si vous maîtrisez le code de l'outil émetteur, puisqu'il doit implémenter le chiffrement. Aucun service du marché ne le fera pour vous. Activez-la depuis les réglages avancés ; Synco génère alors une paire de clés ECDH P-256 et affiche la clé publique à donner à l'émetteur.

L'émetteur doit, pour chaque message : générer une paire de clés éphémère, calculer le secret partagé ECDH avec la clé publique du webhook, en dériver une clé AES-256 par `HMAC-SHA256(sel, secret partagé)` tronqué à 32 octets, chiffrer le message en AES-256-GCM, puis envoyer :

```json
{
  "encrypted": true,
  "content": "<texte chiffré en base64>",
  "nonce": "<vecteur d'initialisation en base64>",
  "tag": "<tag d'authentification GCM en base64>",
  "salt": "<sel en base64>",
  "senderPublicKey": "<clé publique éphémère au format PEM>"
}
```

## Limites

| Limite | Valeur |
|---|---|
| Requêtes par webhook | 100 par minute |
| Requêtes par adresse IP | 1 000 par minute |
| Taille du corps | 1 Mo |
| Longueur du texte | 4 096 caractères |
| Cartes enrichies par message | 10 |

Les champs `mentions` et `attachments` sont acceptés par l'API mais ne sont pas encore rendus dans le fil.

## Que faire quand ça ne marche pas

| Code | Message | Cause la plus fréquente |
|---|---|---|
| 400 | Validation error | Le corps JSON ne respecte pas le format attendu (le détail de la réponse indique le champ fautif). |
| 401 | X-Synco-Signature… required | Le webhook exige une signature et les deux en-têtes manquent. |
| 401 | Invalid signature | Mauvais secret, ou signature calculée sur autre chose que `horodatage + corps brut`. |
| 401 | Timestamp too old | L'horodatage a plus de cinq minutes, ou il est en secondes au lieu de millisecondes. |
| 401 | Invalid token | Le jeton de l'adresse est faux, souvent parce que l'adresse a été régénérée entre-temps. |
| 403 | Webhook is disabled | Le webhook est en pause. |
| 403 | This webhook is not allowed to… | La requête dépasse les autorisations accordées (une carte enrichie sans la permission correspondante, par exemple). |
| 404 | Webhook not found | L'identifiant de l'adresse est faux, ou le webhook a été supprimé. |
| 413 | Payload too large | Le corps dépasse 1 Mo. |
| 429 | Rate limited | Plus de 100 requêtes en une minute. Espacez les envois ou regroupez-les. |

**Rien n'arrive, mais l'API répond 200.** Vérifiez le salon de destination dans la fiche du webhook : le message est peut-être bien arrivé, ailleurs. Le bouton *Test* lève le doute en quelques secondes.

**La signature échoue alors que le calcul semble bon.** La cause la plus courante est un corps recomposé : si votre code sérialise le JSON une fois pour la signature et une autre pour l'envoi, le moindre espace de différence invalide tout. Signez la chaîne exacte que vous envoyez.

## Bonnes pratiques

- **Un webhook par usage**, nommé pour ce qu'il fait. Dix outils derrière une même adresse deviennent impossibles à démêler, et la révoquer les coupe tous.
- **Gardez la signature activée.** C'est la seule chose qui distingue votre outil de quelqu'un qui aurait trouvé l'adresse.
- **Rangez adresse et secret dans les secrets de votre outil**, jamais dans le code ni dans un salon.
- **Régénérez l'adresse** au moindre doute sur sa confidentialité : c'est immédiat et sans conséquence sur l'historique.
- **Mettez en pause plutôt que supprimer** une intégration que vous comptez remettre en service.
- **Regroupez les messages.** Dix commits en une carte plutôt que dix messages : le salon reste lisible et le quota tient.
