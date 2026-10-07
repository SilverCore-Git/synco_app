# 01 — Fondations cryptographiques : identité, code PIN, confiance

| | |
|---|---|
| **Date** | 2026-09-28 — complété le 2026-10-05 (identité de signature, enveloppes signées — audit FC4 §2) |
| **Fichiers clés** | [`synco_app/src/assets/utils/crypto.ts`](../../src/assets/utils/crypto.ts), [`synco_app/src/App.vue`](../../src/App.vue), [`synco_app/src/assets/utils/keyTrust.ts`](../../src/assets/utils/keyTrust.ts), [`synco_app/src/assets/utils/keyPinning.ts`](../../src/assets/utils/keyPinning.ts), [`synco_app/src/assets/utils/keyEnvelope.ts`](../../src/assets/utils/keyEnvelope.ts), [`src/services/pinSecurityService.ts`](../../../synco_api/src/services/pinSecurityService.ts), [`src/routes/users.ts`](../../../synco_api/src/routes/users.ts) |
| **Modèles Prisma** | `User` (dont `publicSignKey`/`encryptedSignPrivateKey`/`signKeyIv`), `UserPinSecret`, et les colonnes `creatorId`/`commitment`/`signature` de `ThreadKey`/`WorkspaceKey`/`DMConversationKey`/`AiSessionKey` |
| **Statut E2EE** | ✅ Fondation E2EE — la clé privée n'est **jamais** disponible en clair côté serveur. Depuis le 05/10, l'**origine** des clés symétriques distribuées est elle-même authentifiable (voir §6), pas seulement leur confidentialité. |

---

## 1. L'identité cryptographique de chiffrement (RSA-OAEP)

Tout l'E2EE de Synco repose sur **une paire de clés RSA par utilisateur**, générée dans le navigateur au tout premier déverrouillage. C'est la paire qui **chiffre** — pour la paire qui **signe** (identité de l'émetteur d'une clé, pas confidentialité), voir §3.

```
crypto.subtle.generateKey({
    name: "RSA-OAEP",
    modulusLength: 4096,
    publicExponent: 65537,
    hash: "SHA-256"
}, true, ["encrypt", "decrypt"])
```

- **Clé publique** : exportée en JWK, sérialisée en JSON, envoyée au serveur, stockée dans `User.publicKey`. C'est elle que les autres membres utilisent pour sceller les clés symétriques à votre intention.
- **Clé privée** : exportée en PKCS#8, **chiffrée localement** en AES-256-GCM avec une clé maître dérivée du code PIN, puis envoyée au serveur sous forme chiffrée uniquement (`User.encryptedPrivateKey` + `User.keyIv`).

Détail important : après le chiffrement, la clé privée est **réimportée en version non extractible** (`extractable = false`) avant d'être placée dans l'état applicatif (`privateKey` ref). Même une injection JavaScript dans la page ne peut donc pas exporter la clé privée en clair — elle peut seulement l'utiliser pour déchiffrer tant que la session est déverrouillée.

La clé privée **ne vit qu'en mémoire vive**, dans un `ref` Vue au niveau module. Elle n'est jamais écrite dans `localStorage`, `sessionStorage` ni IndexedDB. Un rechargement de page = re-saisie du PIN.

`lockSecurity()` remet simplement `privateKey.value = null` : verrouiller revient à oublier la clé.

## 2. Le code PIN — trois générations coexistantes

Le préfixe de `User.pinSalt` identifie le schéma utilisé par le compte. Les trois coexistent en production pour ne verrouiller aucun compte existant.

### 2.1 Schéma « legacy » (aucun préfixe)

- PIN à **4 chiffres**.
- `masterKey = PBKDF2-SHA256(pin, salt, 100 000 itérations) → AES-GCM 256`.
- Défense **entièrement côté client**. Un attaquant qui vole le triplet (`encryptedPrivateKey`, `keyIv`, `pinSalt`) peut tester les 10 000 PIN possibles hors ligne.

> Le code documente explicitement pourquoi le compteur d'itérations n'a pas été relevé globalement : cela aurait changé la clé maître dérivée de **tous** les comptes existants et les aurait définitivement verrouillés.

### 2.2 Schéma `v2:`

- PIN de **6 à 10 chiffres**.
- `masterKey = PBKDF2-SHA256(pin, salt, 600 000 itérations)` — recommandation OWASP 2023.
- Toujours entièrement côté client, mais l'espace de recherche et le coût de dérivation rendent la force brute hors ligne bien plus coûteuse.

### 2.3 Schéma `v3:` — **le schéma cible actuel**

C'est le schéma utilisé pour **toute nouvelle création et toute réinitialisation** de PIN. Il revient à 4 chiffres pour l'ergonomie, en déplaçant la barrière anti-force-brute du client vers le serveur.

```
unlockKey  = PBKDF2-SHA256(pin, rawSalt, 210 000 itérations, 256 bits)
verifier   = HMAC-SHA256(unlockKey, "synco-pin-verifier-v3")        → envoyé au serveur
wrapSecret = 32 octets aléatoires                                    → stocké côté serveur
masterKey  = HKDF-SHA256(ikm = unlockKey, salt = wrapSecret,
                         info = "synco-pin-masterkey-v3")            → AES-GCM 256
```

Propriétés :

1. **Le serveur n'apprend jamais le PIN.** Il ne reçoit que `verifier`, un HMAC à sens unique. Il ne peut pas remonter à `unlockKey`, encore moins au PIN.
2. **Le client seul ne peut pas déchiffrer.** `masterKey` exige `wrapSecret`, qui n'existe que côté serveur, libéré uniquement par `POST /me/pin/unlock` après présentation d'un `verifier` correct.
3. **Un vol du blob client est cryptographiquement insuffisant.** L'attaquant doit passer par un endpoint réseau soumis à verrou, une fois par PIN candidat.

Le compteur PBKDF2 est volontairement plus bas qu'en v2 (210 000 vs 600 000) : le plancher OWASP suppose que le KDF est la **seule** défense, hypothèse qui ne tient plus en v3 ; on garde donc juste « pas instantané » sans pénaliser les appareils mobiles à chaque déverrouillage.

### 2.4 Le verrou serveur anti-force-brute

[`src/services/pinSecurityService.ts`](../../../synco_api/src/services/pinSecurityService.ts)

| Tentatives échouées | Conséquence |
|---|---|
| 1 → 5 | Aucune (tolérance aux fautes de frappe) |
| 3 | 📧 Email d'alerte de sécurité envoyé (avant même le premier verrou) |
| 6 | Verrou 30 s |
| 7 | Verrou 2 min |
| 8 | Verrou 10 min |
| 9 | Verrou 1 h |
| 10 et + | Verrou 24 h (plafond, ne réescalade plus) |

Le compteur (`failedAttempts`, `lockedUntil`, `lastFailedAt`, `alertedAt`) vit dans `UserPinSecret`. `alertedAt` évite de spammer l'utilisateur à chaque échec.

Dans le pire cas atteignable, tester les 10 000 PIN à 24 h par tentative dépasse largement toute fenêtre d'attaque réaliste.

> Historique : l'audit `N6-pin-bruteforce-protection-inerte` du 14/09/2026 avait relevé que cette protection était présente mais inopérante. Elle a été corrigée depuis.

### 2.5 Réinitialisation du PIN — perte de données irréversible

`setupFirstTimeSecurityV3()` génère une **nouvelle paire RSA**. Réinitialiser son PIN ne « redéverrouille » donc pas l'ancien contenu : la nouvelle clé privée ne peut pas déchiffrer les `ThreadKey`, `WorkspaceKey`, `DMConversationKey` ou `AiSessionKey` scellées pour l'ancienne clé publique.

**Conséquence directe : un PIN oublié = perte définitive de tout l'historique chiffré de bout en bout**, tant qu'un autre membre ne redistribue pas les clés concernées vers la nouvelle clé publique. Il n'existe **aucun mécanisme de séquestre (key escrow), aucune clé de récupération d'organisation, aucun code de secours**. C'est une propriété de sécurité voulue, mais c'est aussi le principal risque opérationnel du produit — voir fiche [12](./12-perimetre-limites-modele-de-menace.md).

## 3. L'identité cryptographique de signature (ECDSA P-256) — audit FC4 §2

[`synco_app/src/assets/utils/crypto.ts`](../../src/assets/utils/crypto.ts), [`synco_app/src/assets/utils/keyEnvelope.ts`](../../src/assets/utils/keyEnvelope.ts)

### 3.1 Pourquoi une seconde paire de clés

La paire RSA du §1 répond à une seule question : *« avec quelle clé publique sceller un secret pour cet utilisateur ? »* Elle ne répond pas à : *« qui a réellement créé/choisi ce secret ? »*

Pour les clés symétriques distribuées (`ThreadKey`, `WorkspaceKey`, `DMConversationKey`, `AiSessionKey`), c'est précisément cette seconde question qui comptait encore sans réponse jusqu'au 05/10 : le §4 (TOFU) protège l'identité RSA elle-même, et le §5 (épinglage par engagement) protège une clé symétrique *après* sa première apparition — mais rien ne garantissait qu'une clé acceptée au tout premier contact avait bien été produite par un membre légitime plutôt que plantée par un serveur compromis. C'est ce que corrige l'enveloppe signée du §6, et elle a besoin d'une identité **de signature**, distincte de l'identité **de chiffrement** : on ne réutilise jamais une clé RSA-OAEP pour signer.

### 3.2 Génération et stockage

```
crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
```

- **Clé publique** : JWK, stockée dans `User.publicSignKey` — exposée avec le même statut que `User.publicKey` (projection `PUBLIC_USER_SELECT`, annuaire des membres d'org).
- **Clé privée** : exportée en PKCS#8, chiffrée en AES-256-GCM sous **le même `masterKey`** que la clé privée RSA (même PIN, pas de secret supplémentaire à retenir), stockée dans `User.encryptedSignPrivateKey` + `User.signKeyIv` — pour la même raison que `encryptedPrivateKey` : un second appareil doit pouvoir la déchiffrer avec le même PIN.
- Comme la clé privée RSA, elle est réimportée **non extractible** (`sign` uniquement) avant d'être placée dans `privateSignKey` (ref module, jamais persistée, vidée par `lockSecurity()`).

Elle est générée **au même moment** que la paire RSA, à la création du compte ou à une réinitialisation de PIN (`setupFirstTimeSecurityV3` appelle `generateSigningKeypair(masterKey)` et renvoie les deux paires d'un coup).

### 3.3 Migration des comptes existants

Tout compte créé avant le 05/10 n'a pas de `publicSignKey`. `App.vue` corrige cela au vol, après n'importe quel déverrouillage réussi, tant que `user.value.publicSignKey` est vide :

```
migrateSigningKeyIfNeeded(pin, pinSalt)
   │
   ├─ legacy / v2 → deriveMasterKey(pin, salt) directement
   │
   └─ v3 → nouveau round-trip verifier → wrapSecret (POST /me/pin/unlock, même verrou anti-force-brute que le déverrouillage)
            └─→ deriveMasterKeyV3(...) → generateSigningKeypair(masterKey)
                   │
                   └─→ PATCH /me/signKey { publicSignKey, encryptedSignPrivateKey, signKeyIv }
```

Best-effort : un échec (réseau, PIN verrouillé) n'empêche pas d'utiliser l'application, et sera retenté au prochain déverrouillage puisque `publicSignKey` reste vide côté serveur jusqu'au succès. Pendant cette fenêtre, les enveloppes du §6 sont simplement absentes pour les clés que ce compte distribue — traitées comme avant le 05/10, pas comme une erreur.

Contrairement à la migration PIN `legacy → v3` (§2.5, qui refuse un compte déjà `v2:`/`v3:`), `PATCH /me/signKey` n'impose **aucune immutabilité côté serveur** : la confiance sur cette clé est portée côté client (§4), pas par une règle serveur, qui n'est de toute façon pas en position de juger de sa légitimité.

## 4. Trust-On-First-Use : ne pas croire le serveur sur parole

[`synco_app/src/assets/utils/keyTrust.ts`](../../src/assets/utils/keyTrust.ts)

Le maillon faible théorique de tout E2EE avec annuaire de clés centralisé : le serveur distribue les clés publiques, donc un serveur malveillant peut substituer la sienne et monter une attaque de l'intercepteur.

Synco répond par un **TOFU local**, dédoublé depuis le 05/10 en **deux magasins cloisonnés et indépendants** — un changement sur l'un n'affecte jamais l'autre :

| | Clé de **chiffrement** (RSA) | Clé de **signature** (EC) |
|---|---|---|
| Fonction | `requireTrustedKey()` / `resolveRecipientKey()` | `requireTrustedSignKey()` |
| Préfixe IndexedDB | `trusted-pubkey:` | `trusted-signkey:` |
| Canonicalisation | `canonicalRsaJwk()` (RFC 7638, `{e, kty, n}`) | `canonicalEcJwk()` (`{crv, kty, x, y}`) |
| Sur rencontre inédite | épingle (TOFU) | épingle (TOFU) |
| Sur clé différente | `UntrustedKeyError('changed')` + alerte (`keyTrustAlerts`, `KeyTrustAlerts.vue`) — rattrapable après vérification d'empreinte hors bande | `UntrustedKeyError('changed')` — **refus sans rattrapage dédié** (voir limite au §6.4) |
| Sert à | sceller une clé symétrique *pour* cet utilisateur | vérifier qu'une enveloppe (§6) a bien été signée *par* cet utilisateur |

Propriétés communes aux deux :

- `computeKeyFingerprint()` produit une empreinte SHA-256 tronquée à 16 caractères hexadécimaux, destinée à la **comparaison hors bande** (de vive voix, par un autre canal) ;
- `trustKey()` permet de re-faire confiance explicitement à une clé de chiffrement changée, après confirmation humaine (pas d'équivalent encore pour la clé de signature — §6.4) ;
- `lookupCreatorSignKey(creatorId)` résout la clé de signature publique d'un créateur depuis l'annuaire des membres déjà chargé (`openedOrg.value.members`) — aucune requête réseau dédiée ; renvoie `null` si l'annuaire n'a pas encore été chargé localement, traité comme « non vérifiable » plutôt que comme une alerte (voir §6.3).

Dans `ChatView.vue`, un changement de clé **de chiffrement** bloque l'envoi du message et ouvre un panneau de vérification d'empreinte : l'utilisateur doit confirmer avant que quoi que ce soit ne parte.

> Cette mesure vient de la remédiation d'un constat d'audit (« le serveur ne doit pas être une source d'identité de clé faisant autorité »).

**Limite connue, commune aux deux magasins :** le cache est par appareil. Sur un nouvel appareil, toutes les clés sont « nouvelles » — première connexion = confiance implicite. C'est exactement la limite que l'enveloppe signée du §6 réduit (sans l'éliminer) pour les clés *symétriques* : elle ne change rien au TOFU sur les identités elles-mêmes.

## 5. Clés symétriques : épinglage par engagement — audit FC4 §1

[`synco_app/src/assets/utils/keyPinning.ts`](../../src/assets/utils/keyPinning.ts)

Avant le §6, une clé symétrique (`ThreadKey`, `WorkspaceKey`, `DMConversationKey`, `AiSessionKey`) servie par l'API était simplement acceptée et utilisée — y compris pour redéchiffrer silencieusement tout l'historique si le serveur en substituait une autre à la suite d'un redémarrage de clé. `keyPinning.ts` applique le même principe que le TOFU du §4, mais à la **valeur de la clé elle-même**, par `(contexte, version)` plutôt que par identité d'utilisateur :

```
keyCommitment(clé, ctx, version) = SHA-256("synco-key-commit-v1|" ‖ ctx ‖ "|" ‖ version ‖ "|" ‖ octets bruts de la clé)
```

- `pinOrCheckKey()` : première clé vue pour `(ctx, version)` → engagement mémorisé (IndexedDB, cloisonné par compte) ; clé différente ensuite pour le **même** `(ctx, version)` → `KeyChangedError`, la clé n'est ni lue ni utilisée pour écrire, jusqu'à une décision explicite (`repinKey()`, après vérification par l'utilisateur — voir `ThreadView.vue`).
- `ctx` prend la forme `space:<id>` / `thread:<id>` / `dm:<id>` / `ai:<id>`.

**Limite assumée et documentée dans le code lui-même** (`keyPinning.ts`, en-tête du fichier) : *une fausse clé servie dès le tout premier accès à un `(ctx, version)` est épinglée telle quelle* — le mécanisme détecte un changement **après** le premier contact, pas une substitution **au** premier contact. C'est exactement le trou que ferme l'enveloppe signée ci-dessous.

## 6. Enveloppes signées de distribution de clé — audit FC4 §2

[`synco_app/src/assets/utils/keyEnvelope.ts`](../../src/assets/utils/keyEnvelope.ts)

### 6.1 Le principe

Quand un membre crée ou redistribue une copie d'une clé symétrique, il **signe** `(contexte, version, engagement)` avec sa propre clé de signature (§3), en plus de sceller la clé en RSA-OAEP pour chaque destinataire (inchangé). Le destinataire vérifie cette signature contre la clé de signature **épinglée** (§4) du créateur *avant* de faire confiance à la clé — y compris lors de la **toute première** rencontre avec ce `(contexte, version)`, ce que le `pinOrCheckKey()` du §5 ne peut pas faire seul.

```
KeyEnvelope = { v: 1, ctx, version, creatorId, commitment, signature }

signature = ECDSA-P256-SHA256(
    privateSignKey_du_créateur,
    "synco-key-envelope-v1|" ‖ ctx ‖ "|" ‖ version ‖ "|" ‖ commitment
)
commitment = keyCommitment(clé_brute, ctx, version)      // même fonction que le §5
```

Une seule signature couvre **tout un lot** de scellés RSA différents (un par destinataire) : le `commitment` ne dépend que de la valeur de la clé, du contexte et de la version — jamais du scellé RSA d'un destinataire en particulier, qui diffère pourtant pour chacun.

### 6.2 Vérification côté réception

`verifyKeyEnvelopeIfPresent(cléBrute, ctx, version, { creatorId, commitment, signature })`, appelée **avant** `pinOrCheckKey()` sur les cinq points d'ancrage (même ordre partout) :

```
1. Si creatorId/commitment/signature absents  → on ne fait rien (voir §6.3), comportement identique à avant le 05/10.
2. lookupCreatorSignKey(creatorId)             → clé publique de signature du créateur, depuis l'annuaire local.
   Introuvable localement                      → on ne fait rien non plus (§6.3) — limitation opérationnelle, pas un refus.
3. requireTrustedSignKey(creatorId, cléTrouvée) → TOFU (§4) : première fois → épingle ; différente de l'épingle → UntrustedKeyError, LA CLÉ N'EST PAS UTILISÉE.
4. verifyKeyEnvelope() :
     a. recalcule keyCommitment() sur la clé RÉELLEMENT déchiffrée (pas sur une valeur déclarée)
        et la compare à `commitment` → sinon KeyEnvelopeError('commitment-mismatch').
     b. vérifie la signature ECDSA avec la clé de signature de confiance
        → sinon KeyEnvelopeError('bad-signature').
5. Seulement alors : pinOrCheckKey() (§5), comme avant.
```

Points d'ancrage câblés : `workspaceCrypto.ts` (`WorkspaceKey`), `dmCrypto.ts` (`DMConversationKey`), `fileKeys.ts` (`ThreadKey`, pièces jointes), `useLiveKit.ts` (même `ThreadKey`, clé média du salon vocal), `AiSessionKeyService.ts` (`AiSessionKey`).

### 6.3 Politique de tolérance — un seul cas est toléré

| Cas | Comportement | Pourquoi |
|---|---|---|
| Enveloppe entièrement absente | Accepté (comme avant le 05/10) | Compte émetteur pas encore migré (§3.3), ou donnée créée avant le 05/10 |
| Créateur non résolvable localement (annuaire pas chargé) | Accepté, avertissement en console | Limitation opérationnelle (timing de chargement), pas un signal d'attaque |
| `commitment` incohérent avec la clé réellement reçue | **Refusé** | La clé a été substituée après signature, ou l'enveloppe ne lui correspond pas |
| Signature invalide pour la clé de signature de confiance | **Refusé** | L'enveloppe n'a pas été produite par le créateur annoncé |
| Identité de signature du créateur **changée** depuis le premier épinglage | **Refusé** | Signal plus grave qu'une enveloppe absente : quelqu'un d'autre signe désormais au nom de ce `creatorId` |

Une enveloppe **présente mais invalide** est donc traitée plus sévèrement qu'une enveloppe **absente** — c'est le choix de conception central de ce mécanisme : l'absence est un défaut de déploiement progressif, l'invalidité est une attaque potentielle.

### 6.4 Ce que §6 corrige, et ce qu'il ne corrige pas

**Corrige :** un serveur (ou toute partie en capacité d'écrire dans `ThreadKey`/`WorkspaceKey`/`DMConversationKey`/`AiSessionKey`) ne peut plus planter une clé arbitraire au tout premier contact d'un `(contexte, version)` sans la signature privée d'un créateur légitime, que le serveur ne détient jamais.

**Ne corrige pas (limites assumées, à relire avec la fiche [12](./12-perimetre-limites-modele-de-menace.md)) :**

- **Authenticité ≠ autorisation.** La signature prouve que `creatorId` a bien produit cette clé, pas qu'il avait le droit de la distribuer dans ce contexte précis — cette autorisation reste vérifiée côté serveur (rangs de rôle, appartenance à l'espace/salon), jamais recalculée côté client à partir de l'enveloppe.
- **La toute première rencontre avec une identité de signature reste du TOFU** (§4) : l'enveloppe déplace la confiance « quelle clé croire » vers « quelle identité croire », elle ne l'élimine pas.
- **Pas d'alerte dédiée pour une identité de signature changée**, contrairement au changement de clé de chiffrement (panneau de vérification d'empreinte dans `ChatView.vue`) : l'erreur remonte comme une erreur générique. À construire si ce cas se présente en pratique.
- **Pas de protection contre un rejeu de version antérieure.** `pinOrCheckKey()` épingle par `(ctx, version)` — deux versions différentes ont deux engagements distincts. Un serveur qui reservirait une ancienne version, valablement signée à l'époque, à la place de la dernière n'est pas détecté par ce mécanisme (limite déjà présente en §5, non aggravée ni corrigée par §6).
- **`synco_api` ne valide jamais la signature.** Les colonnes `creatorId`/`commitment`/`signature` sont de simples passe-plats, acceptés et servis tels quels (bornés en taille) — toute la vérification cryptographique est côté client, par construction (le serveur n'est pas l'ancre de confiance).
- **La toute première `ThreadKey` d'un salon neuf n'est pas signée.** Son identifiant n'est attribué par le serveur qu'à la création, donc inconnu au moment de signer `thread:<id>` côté client. Toute redistribution ultérieure à ce même salon (nouveau membre, `distribute-thread-keys`) l'est.
- **Les invités par lien d'invitation ne portent aucune enveloppe.** Le flux `ThreadInvites.ts` reste inchangé par cet audit.

## 7. Chaîne de confiance complète

```
                       PIN (4 chiffres, v3)
                            │
                  PBKDF2 210k ─┴─→ unlockKey ──HMAC──→ verifier ──→ serveur
                            │                                         │
                            │              wrapSecret ←───────────────┘
                            │                   │            (libéré si verifier OK,
                            └───── HKDF ────────┘             sous verrou exponentiel)
                                    │
                                 masterKey (AES-GCM 256)
                            ┌───────┴───────┐
                            ▼               ▼
      déchiffre User.encryptedPrivateKey   déchiffre User.encryptedSignPrivateKey
                            │               │
            Clé privée RSA-4096          Clé privée EC P-256
         (chiffrement, non extractible)  (signature, non extractible — §3)
                            │               │
                            │               └──signe──▶ KeyEnvelope { ctx, version, commitment, signature } (§6)
                            │                                     │
        ┌───────────────┬───┴─────────┬───────────────┬──────────┤  vérifié par le destinataire contre
        ▼               ▼             ▼               ▼          │  la clé de signature épinglée (§4)
    ThreadKey     WorkspaceKey  DMConversationKey  AiSessionKey  │  du creatorId annoncé
    (salons)      (fichiers)    (fichiers DM)      (IA gateway)  │
        │               │             │               │          ▼
        │               │             │               │   pinOrCheckKey() (§5) — engagement par (ctx, version)
        ▼               ▼             ▼               ▼
    messages,       fichiers      fichiers DM     sessions IA
    index de       chiffrés                                        clé LiveKit = ThreadKey (audio/vidéo du salon)
    recherche
```

Les messages privés (DM) sont le seul flux qui **n'utilise pas de clé intermédiaire persistante** pour son contenu : chaque message porte sa propre clé AES scellée directement par RSA. Voir fiche [04](./04-messages-prives-dm.md). L'enveloppe signée (§6) ne s'applique qu'aux quatre clés intermédiaires de gauche, pas à ce cas.

## 8. Ce que cette fondation ne protège pas

- **Un appareil compromis pendant une session déverrouillée.** Les deux clés privées (chiffrement et signature) sont en RAM et utilisables ; le PIN ne protège qu'au repos.
- **Le premier contact avec une identité** (de chiffrement §4, ou de signature §3/§4), sur un appareil neuf — pas de cache TOFU encore constitué. L'enveloppe signée (§6) authentifie l'**origine** d'une clé symétrique une fois les identités en présence déjà de confiance ; elle ne fait pas de Synco un système « zero trust » dès la première rencontre.
- **L'autorisation d'un créateur légitime mais malveillant.** Un membre qui a réellement le droit de distribuer une clé pour un contexte (admin d'espace, participant d'un DM, détenteur `ORG_AI`...) peut la signer valablement tout en y plaçant un secret compromis par ailleurs — l'enveloppe prouve l'auteur, pas ses intentions.
- **Les métadonnées.** Le serveur connaît qui parle à qui, quand, dans quel salon, avec combien de pièces jointes de quelle taille — et, depuis le 05/10, qui a créé/distribué chaque copie de clé (`creatorId` en base, non chiffré).
- **Le code du client lui-même.** Synco est une application web : le serveur sert le JavaScript qui manipule les clés. Un serveur malveillant peut servir un client modifié. C'est la limite structurelle de tout E2EE livré par le web, mitigée seulement par les binaires Tauri/Capacitor (desktop/mobile), où le code est empaqueté et signé.
