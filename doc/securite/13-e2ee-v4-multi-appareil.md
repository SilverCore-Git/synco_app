# 13 — E2EE v4 : multi-appareil, secret matériel, PIN purement local (SPÉCIFICATION)

| | |
|---|---|
| **Statut** | 🚧 En cours — branche `feat/e2ee-v4` (synco_app et synco_api). P1 à P6 faits (P6, le retrait d'appareil avec rotation d'AK, a été réalisé avec l'interface de P4) ; P7 faite : récupération par PIN (§14, service `synco_keyguard`) et rotation d'identité (§15). Audit et pentest de l'ensemble : [`audits/audit_pentest_e2ee-v4_2026-10-18/`](../../audits/audit_pentest_e2ee-v4_2026-10-18/README.md) (10 constats, dont V4A1 haut, corrigé). Rien n'a encore été validé sur de vrais appareils (§13.6). |
| **Origine** | Audit 2026-10-01, FC2 : le serveur détient un vérificateur et un `wrapSecret` qui permettent de forcer les 10 000 PIN hors ligne. |
| **Contraintes** | PIN à **4 chiffres** conservé (expérience utilisateur) · **multi-appareil obligatoire** · compatibilité : les comptes legacy/v2/v3 continuent de fonctionner tant qu'ils ne migrent pas · le plus sûr possible. |

---

## 1. Idée directrice

Un PIN de 4 chiffres ne peut pas être la seule protection d'un secret que le serveur peut tester hors ligne : 13 bits d'entropie, aucune fonction de dérivation n'y change quoi que ce soit.

**La v4 retire le PIN de la chaîne de confiance du serveur.** Le serveur ne stocke plus aucun vérificateur dérivé du PIN. Les clés d'identité sont protégées par des secrets aléatoires de 256 bits, détenus par les appareils de l'utilisateur. Le PIN devient un **verrou local** (comme celui d'un téléphone), ce qui est le rôle pour lequel 4 chiffres sont acceptables, à condition que le matériel limite les essais.

L'identité elle-même (paires RSA-OAEP et ECDSA) **ne change pas** : tous les `ThreadKey`, `WorkspaceKey`, `DMConversationKey` et messages existants restent déchiffrables. Seule change la façon dont les clés privées sont enveloppées.

## 2. Modèle de clés

```
Identité (inchangée)   RSA-OAEP 4096 + ECDSA P-256
        │  enveloppées par
        ▼
AccountKey (AK)        256 bits aléatoires, créée une fois, jamais en clair côté serveur
        │  enveloppée pour chaque appareil (vers sa clé publique) et par la clé de récupération
        ▼
┌ Paire d'appareil     ECDH P-256 : la clé publique est enregistrée sur le serveur
│  ├ Certificat        signature d'identité sur (utilisateur, appareil, plateforme, clé publique)
│  ├ DeviceEnvelope    ECDH éphémère + HKDF + AES-GCM(AK) vers la clé publique de l'appareil
│  └ DK                256 bits aléatoires dans le coffre matériel ; scelle uniquement la clé privée de l'appareil
└ RecoveryKey (RK)     256 bits, montrée une seule fois à l'utilisateur
   └ RecoveryEnvelope  AES-GCM(HKDF(RK), AK) — stockée sur le serveur
```

- **Pourquoi une paire par appareil** : pour retirer un appareil, un appareil restant doit pouvoir produire une nouvelle enveloppe d'une **nouvelle AK** pour tous les autres, sans connaître leurs DK. Avec des enveloppes symétriques, chaque appareil devrait être présent pour la rotation.
- **Le serveur ne voit jamais** : AK, DK, la clé privée d'un appareil, RK, ni le PIN. Il stocke des clés publiques et des enveloppes chiffrées.
- **Compromission du serveur seul** : l'attaquant obtient des enveloppes qu'il ne peut ouvrir sans la clé privée d'un appareil (scellée par sa DK dans le coffre matériel) ni RK. Aucune force brute possible : il n'existe pas de secret faible à tester.
- Les clés privées d'identité sont chiffrées par AK (et non plus par une clé dérivée du PIN). Un changement de PIN ne touche donc plus à rien de chiffré côté serveur.

## 3. Coffre local par plateforme (où vit DK)

| Plateforme | Stockage de DK | Déverrouillage | Limitation d'essais |
|---|---|---|---|
| **Capacitor iOS** | Keychain, accès `biometryCurrentSet` (+ code de l'appareil en repli), `ThisDeviceOnly` | Face ID / Touch ID | Matérielle (Secure Enclave) |
| **Capacitor Android** | Clé AES dans le Keystore (StrongBox si disponible), `setUserAuthenticationRequired`, invalidée si de nouvelles empreintes sont enrôlées | Empreinte / visage / code de l'appareil | Matérielle (TEE/StrongBox) |
| **Tauri (desktop)** | Trousseau du système (déjà utilisé pour le jeton de rafraîchissement, FC9) ; Windows Hello en option | Session OS ; PIN local en repli | Selon l'OS |
| **Web** | Secret fourni par **passkey WebAuthn (extension PRF)** quand disponible ; sinon DK enveloppée par une clé non extractable en IndexedDB + PIN | Passkey (biométrie) ou PIN | PRF : matérielle. Sans PRF : **logicielle seulement** (voir §7) |

Le PIN à 4 chiffres sert de **repli local** quand la biométrie est indisponible ou refusée. Il ne quitte jamais l'appareil.

## 4. Flux utilisateur

### 4.1 Création de compte
1. L'app génère l'identité, AK, DK et RK.
2. Elle écrit sur le serveur : clés publiques, clés privées enveloppées par AK, `DeviceEnvelope`, `RecoveryEnvelope`.
3. Elle affiche la **clé de récupération** une fois (copie, impression, fichier) et exige une confirmation.
4. L'utilisateur choisit son PIN local et active la biométrie.

### 4.2 Utilisation quotidienne
Connexion Keycloak → l'app récupère le `DeviceEnvelope` de son `deviceId` → coffre local déverrouillé par biométrie ou PIN → DK → AK → identité. Aucun appel au serveur n'est nécessaire pour valider un PIN.

### 4.3 Ajouter un appareil (cas normal, sans serveur de confiance)
1. Le **nouvel appareil** génère une paire ECDH éphémère et un **secret de liaison** de 128 bits. Il affiche un **QR code** contenant le secret et l'identifiant de la demande, ou le même secret sous forme de **code à recopier** (28 caractères, somme de contrôle incluse). Le secret ne quitte jamais l'écran : il n'est **pas** envoyé au serveur. Seules la clé publique éphémère et l'identifiant sont déposés.
2. Un **appareil déjà connecté** scanne le QR (ou reçoit le code saisi), affiche le nom et la plateforme du nouvel appareil et demande une confirmation explicite.
3. Il calcule ECDH + HKDF **avec le secret de liaison**, chiffre AK pour le nouvel appareil et dépose cette enveloppe temporaire (`DeviceLinkRequest`, quelques minutes, usage unique).
4. Le nouvel appareil l'ouvre, génère sa paire d'appareil permanente et sa DK, **fait certifier sa clé publique par la clé de signature d'identité** qu'il vient de recevoir, puis enregistre son appareil (le serveur vérifie le certificat).
5. Pourquoi le secret : sans lui, un serveur actif qui connaît les clés publiques pourrait fabriquer une enveloppe contenant une fausse AK (et de fausses clés d'identité) que le nouvel appareil accepterait, ou se faire passer pour le nouvel appareil auprès de l'appareil connecté. Avec lui, il ne peut dériver aucune des clés d'enveloppe. Il doit être fort (128 bits) : un secret court se testerait hors ligne contre l'enveloppe.
6. Un **code à 6 chiffres**, affiché des deux côtés, confirme l'intention de l'utilisateur. Il **n'est pas** une défense contre un serveur actif (20 bits se forcent en quelques secondes).

**Certificats d'appareil.** Chaque appareil est certifié par la clé de signature d'identité du compte (ECDSA), sur (utilisateur, identifiant, plateforme, clé publique). Un appareil qui enveloppe une nouvelle AK pour les autres (rotation) **vérifie chaque certificat** contre la clé de signature d'identité épinglée et ignore tout appareil non certifié : le serveur ne peut pas y glisser sa propre clé pour obtenir la nouvelle AK. Le serveur vérifie aussi les certificats à l'enregistrement, donc une simple session Keycloak ne suffit pas à ajouter un appareil.

### 4.4 Aucun autre appareil disponible
1. **Clé de récupération** : l'utilisateur la saisit, l'app ouvre `RecoveryEnvelope`, puis enregistre l'appareil comme en 4.3 (étapes 4).
2. **Sans clé de récupération** : voir §6 (récupération par PIN, plus faible et explicitement présentée comme telle). En dernier recours, réinitialisation avec perte de l'historique (comportement actuel).

### 4.5 Retirer un appareil perdu
Un appareil connecté demande une confirmation, génère une **nouvelle AK**, réenveloppe l'identité et la clé de récupération, produit une enveloppe pour la clé publique de **chaque appareil restant** et envoie le tout en une seule transaction (le serveur vérifie que l'ensemble des appareils actifs est exactement couvert). L'appareil retiré perd son enveloppe et ne peut plus rien obtenir de neuf. Un appareil volé avec son coffre déverrouillé connaît encore l'identité : voir §7 pour la rotation d'identité, hors périmètre de la première version.

## 5. Modèle serveur (esquisse)

```
UserDevice        id, userId, name, platform, devicePublicKey (jwk), certificate (b64), deviceEnvelope (b64), createdAt, lastUsedAt
AccountRecovery   userId, recoveryEnvelope (b64), kdfInfo, createdAt        -- 0..1 par utilisateur
DeviceLinkRequest id, userId, devicePublicKey (jwk), envelope (b64 nullable), expiresAt, consumedAt
User              + e2eeVersion ('v3' | 'v4'), encryptedPrivateKey / encryptedSignPrivateKey = chiffrées par AK en v4
UserPinSecret     supprimée pour un compte v4 (plus aucun vérificateur de PIN côté serveur)
```

Toutes les colonnes sensibles passent par le chiffrement de champ existant (`/// @encrypted`). Les routes sont authentifiées par le jeton Keycloak ; la liaison d'un appareil et la récupération sont limitées en débit et notifient l'utilisateur (e-mail + notification in-app, comme pour le PIN aujourd'hui).

## 6. Récupération sans appareil ni clé de récupération (chemin faible, optionnel)

Seul chemin où un PIN à 4 chiffres protège encore un secret détenu par le serveur. Pour le durcir sans l'illusion de le rendre sûr :

```
recoveryPinKey = HKDF( PBKDF2(pin) ‖ serverSecret ‖ thirdPartySecret )
```

> Réalisé en P7 sous une forme plus forte que cette esquisse : les deux secrets sont des **clés OPRF** (§14). Le PIN n'est jamais envoyé, même dérivé ; chaque acteur ne voit qu'un élément aveuglé.

- `serverSecret` : stocké dans la base de `synco_api`, libéré après vérification du jeton et limitation d'essais.
- `thirdPartySecret` : détenu par un **troisième acteur** (service de clés dédié, ou Keycloak via un client/une audience réservés dont le jeton n'est **jamais** envoyé à `synco_api`).
- Un attaquant doit alors compromettre **les deux** composants et connaître le PIN ; en revanche, qui obtient les deux secrets force 10 000 PIN en quelques secondes.
- Activation **explicite** par l'utilisateur, avec avertissement. Désactivable (toute la sécurité repose alors sur les appareils et la clé de récupération).

## 7. Limites assumées

- **Web sans PRF** : le PIN à 4 chiffres est la seule barrière contre quelqu'un qui copie le profil du navigateur. Les navigateurs n'offrent pas de limiteur d'essais matériel. C'est l'état de l'art pour le web et c'est signalé à l'utilisateur.
- **Vérification à l'ouverture (P3/P5)** : après avoir ouvert AK puis les clés d'identité, un appareil doit vérifier que la clé publique RSA dérivée de la clé privée correspond à celle qu'il a épinglée (ou, pour un appareil neuf, à celle annoncée par une source indépendante du serveur lors de la liaison). C'est la défense contre un serveur qui servirait de fausses enveloppes **et** de fausses clés d'identité.
- **Appareil volé déverrouillé** : il connaît l'identité jusqu'à sa rotation (§15). La rotation d'identité le prive de tout ce qui est scellé ensuite pour la nouvelle clé (DM, nouvelles clés distribuées) ; les clés de salons et d'espaces qu'il a déjà vues restent valides jusqu'à leur propre renouvellement.
- **Perte de tous les appareils sans clé de récupération ni récupération par PIN** : perte de l'historique, comme aujourd'hui.
- **Biométrie** : une modification des empreintes enrôlées peut invalider la clé du Keystore ; le repli par PIN local puis la reliaison de l'appareil prennent le relais.

## 8. Migration depuis v3 (et v2, legacy)

Les comptes existants restent fonctionnels et inchangés tant qu'ils ne migrent pas.
1. À un déverrouillage réussi en v3, l'app propose la mise à niveau (ou l'impose après une période).
2. Elle génère AK, DK et RK, réenveloppe les **mêmes** clés privées d'identité sous AK, écrit les enveloppes, montre la clé de récupération.
3. Une fois les enveloppes v4 confirmées, le serveur **supprime** `UserPinSecret` et les anciennes colonnes d'enveloppe PIN. Aucune double écriture : conserver le blob v3 maintiendrait la faiblesse.
4. Les anciennes versions de l'app ne savent pas déverrouiller un compte v4.

## 9. Plan de réalisation

| Phase | Contenu |
|---|---|
| **P1** ✅ | Noyau cryptographique pur et testé : AK, enveloppes, liaison d'appareil (ECDH + SAS), clé de récupération, formats versionnés |
| **P2** ✅ | API : schéma Prisma, routes (appareils, liaison, récupération), limitation de débit, notifications, tests |
| **P3** ✅ | Coffres par plateforme : web (PRF/IndexedDB), Capacitor (biométrie native), Tauri |
| **P4** ✅ | Interface : onboarding, clé de récupération, **paramètres utilisateur › « Appareils et sécurité »** (liste, nom, plateforme, dernière activité, appareil actuel, déconnexion, ajout par QR, clé de récupération, récupération par PIN annoncée), liaison par QR, déverrouillage (§13) |
| **P5** ✅ | Migration v3 → v4 proposée dans les paramètres, suppression du matériel PIN côté serveur (§13.4) |
| **P6** ✅ | Révocation d'appareil avec rotation d'AK (réalisée avec P4, §13.2) |
| **P7** ✅ | Récupération par PIN durcie (troisième acteur, §14) et rotation d'identité (§15) |

Chaque phase est committée séparément, avec ses tests, et reste compatible avec les comptes existants.

## 10. Décisions

| # | Question | Décision |
|---|---|---|
| 1 | Clé de récupération | **Proposée au téléchargement à la création du compte** (non forcée). |
| 2 | Récupération par PIN (§6) | **Proposée** à l'utilisateur, avec avertissement sur sa moindre sécurité. |
| 3 | Troisième acteur (§6) | **Service séparé `synco_keyguard`**, dépôt indépendant, isolé dans son conteneur (même opérateur, infrastructure séparée). |
| 4 | Migration v3 → v4 (§8) | **Proposée** (pas imposée dans un premier temps). |
| 5 | Retrait d'un appareil (§4.5) | **Rotation d'AK seule** en v1 (appliquée en P4), rotation d'identité plus tard (P7). |
| 6 | Clé de récupération et rotation d'AK | Une rotation **renouvelle la clé de récupération** (nouvelle clé affichée) : l'ancienne enveloppait l'ancienne AK, et aucun appareil ne détient RK. |
| 7 | Dépendances QR | `uqr` 0.1.3 (affichage) et `jsqr` 1.4.0 (lecture si `BarcodeDetector` est absent), sans dépendance transitive. |

## 11. Gestion des appareils dans les paramètres

Nouvelle section **« Appareils et sécurité »** dans les paramètres utilisateur :
- liste des appareils : nom modifiable, plateforme, date d'ajout, dernière activité, badge « Cet appareil » ;
- **Déconnecter** un appareil (confirmation avec `ConfirmDelete.vue`, jamais de dialogue natif) : retrait + rotation d'AK ;
- **Ajouter un appareil** : QR code à scanner depuis un appareil connecté, avec le code de vérification à comparer ;
- **Clé de récupération** : télécharger / régénérer (régénérer invalide la précédente) ;
- **Récupération par PIN** : activer / désactiver avec avertissement ;
- verrou local : changer le PIN local, activer / désactiver la biométrie ;
- alertes : e-mail et notification in-app à l'ajout et au retrait d'un appareil.

## 12. Coffres par plateforme — état de P3 (`src/assets/deviceVault/`)

| Coffre | Fichier | Testé |
|---|---|---|
| Web, passkey WebAuthn PRF | `prfVault.ts` | authentificateur simulé |
| Web, repli PIN local (PBKDF2 600 000, effacement au 10ᵉ échec) | `pinVault.ts` | oui |
| Capacitor, Keychain / Keystore + biométrie ou code de l'appareil | `nativeVault.ts` | plugins simulés |
| Tauri, trousseau du système (`secure_store_*`, clés `e2ee-dk:<uuid>` seulement) | `keyringVault.ts`, `src-tauri/src/lib.rs` | commande simulée, liste blanche Rust vérifiée isolément |
| Orchestration : inscription avec repli, déverrouillage d'AK | `localDevice.ts` | oui |

**À valider sur de vrais appareils** (non faisable depuis cet environnement) : Face ID / Touch ID (iOS), empreinte / visage (Android), Windows Hello / Secret Service (desktop), passkey PRF sur Chrome, Safari, Edge et Firefox. Après `bun install`, `npx cap sync` est nécessaire pour embarquer `@aparajita/capacitor-biometric-auth` dans les projets natifs.

**Points de conception**
- À l'inscription, les coffres sont essayés du plus protecteur au repli ; seule l'*indisponibilité* de la plateforme autorise un repli, jamais une annulation de l'utilisateur.
- Web : sans authentificateur de plateforme (`isUserVerifyingPlatformAuthenticatorAvailable()` faux, typiquement Chrome sous Linux sans gestionnaire de passkeys), `PrfVault` répond « indisponible » **avant** toute invite, pour éviter la fenêtre « téléphone par QR / clé USB » ; l'inscription passe directement au PIN local. Conséquence : une clé de sécurité USB avec PRF seule n'est pas proposée.
- Au déverrouillage, la clé publique servie par le serveur doit être celle enregistrée localement, sinon l'enveloppe est refusée.
- Une fois AK ouverte, l'appelant (P4/P5) doit encore vérifier que la clé d'identité déchiffrée correspond à celle qu'il a épinglée (voir §7).
- Capacitor : la biométrie est un contrôle côté application devant un secret protégé par le trousseau de l'OS, non lié cryptographiquement à la lecture. Un appareil sans aucun verrouillage d'écran est refusé.

## 13. Interface et migration — état de P4 / P5

### 13.1 Fichiers

| Rôle | Fichier | Testé |
|---|---|---|
| Orchestration (déverrouillage, création, liaison des deux côtés, récupération, rotation, migration) | `src/assets/e2eeV4/session.ts` | oui, de bout en bout contre un serveur simulé qui applique les règles de `synco_api` |
| Appels HTTP `/api/e2ee/v4` | `src/assets/e2eeV4/api.ts` | non (mince) |
| Liaison avec l'application (coffres, keyTrust, `privateKey`) | `src/assets/e2eeV4/runtime.ts` | type-check |
| Écran de verrouillage v4 (déverrouillage, connexion d'un appareil, création, réinitialisation) | `src/components/e2ee/V4Gate.vue`, branché dans `App.vue` | type-check, build |
| Paramètres › Appareils et sécurité | `src/components/settings/DevicesSecurity.vue`, `E2eeUpgrade.vue` (migration) | type-check, build |
| Pavé PIN, QR code, lecteur de QR, clé de récupération | `src/components/e2ee/*.vue` | type-check, build |
| Verrous API, retrait multiple, réinitialisation | `synco_api` : `routes/users.ts`, `routes/e2eeV4.ts`, `security/e2ee-v4-p4.db.test.ts` | oui |

### 13.2 Règles appliquées

- **Aucune AK gardée pendant la session.** Chaque opération sensible (répondre à une liaison, retirer un appareil, régénérer la clé de récupération, changer de coffre) rouvre le coffre : biométrie, passkey ou PIN local. AK, DK, RK et les PKCS#8 d'identité sont effacés (`fill(0)`) après usage, hors de tout état Vue.
- **Identité épinglée.** À l'inscription d'un appareil, les clés publiques *dérivées des clés privées ouvertes* (AK authentifiée par le secret de liaison, la clé de récupération ou la création) sont enregistrées dans l'enregistrement local et dans keyTrust. À chaque déverrouillage, l'identité ouverte doit leur correspondre (défense du §7), puis correspondre à ce que sert le serveur.
- **Rotation.** Les certificats sont vérifiés contre la clé de signature épinglée. Un appareil non certifié ne reçoit jamais d'enveloppe : il est signalé dans la liste (« Non certifié ») et retiré avec l'appareil demandé (`removeDeviceIds`). Sur un 409 (appareil ajouté entre-temps), la rotation recommence avec la liste à jour, sans redemander le coffre. Un appareil peut se retirer lui-même s'il en reste un autre ; le dernier appareil ne peut pas être retiré.
- **Liaison.** Le QR contient `synco-link:1:<requestId>:<secret>` ; le code à recopier est le même secret (28 caractères). Ni l'un ni l'autre ne part vers l'API. En saisie manuelle, l'appareil connecté choisit parmi les demandes en attente (nom, plateforme, heure). Le code à 6 chiffres est affiché des deux côtés ; le nouvel appareil ne s'inscrit qu'après « Les codes correspondent ».
- **Création de compte.** Le PIN local n'est demandé que si le coffre l'exige (web sans passkey PRF). Après une annulation de l'invite passkey, l'utilisateur peut choisir explicitement le PIN local (jamais de repli silencieux). La clé de récupération est proposée ; si l'utilisateur continue sans elle (confirmation `ConfirmDelete`), aucune enveloppe n'est enregistrée.
- **Comptes legacy / v2 / v3** : écran PIN d'`App.vue` inchangé ; le gestionnaire clavier global est neutralisé quand l'écran v4 est affiché.

### 13.3 Compléments côté API

- **Preuve de possession de l'identité** (audit V4A1) : `/rotate`, `/rotate-identity`, `PUT` / `DELETE /recovery`, `/pin-recovery/commit`, `DELETE /pin-recovery` et `/link/:id/answer` exigent une signature ECDSA de la clé de signature d'identité sur `synco-e4-proof|userId|action|SHA-256(identité scellée actuelle)|SHA-256(JSON stable du corps)` ; sinon 403. Une session Keycloak volée ne peut plus écraser l'état chiffré.

- Les routes `/me/initE2EE`, `/me/resetE2EE`, `/me/pin/migrate`, `/me/pin/unlock`, `/me/signKey` et `/me/publicKey` répondent **409** pour un compte v4. Sans ce verrou, une session Keycloak volée pouvait remplacer `publicSignKey` (et faire accepter par le serveur des appareils certifiés par sa propre clé), réintroduire un PIN testable hors ligne via `/me/pin/migrate` (qui acceptait tout sel ni `v2:` ni `v3:`, donc `v4:`), ou rendre l'identité illisible.
- `POST /rotate` accepte `removeDeviceIds[]`.
- `POST /e2ee/v4/reset` : réinitialisation de dernier recours (nouvelle identité, premier appareil ; appareils, récupération et liaisons précédents supprimés ; `ThreadKey` supprimées comme dans `/me/resetE2EE`), protégée par le code reçu par e-mail. Le certificat est vérifié avant de consommer le code.

### 13.4 Migration v3 → v4 (P5)

Proposée dans les paramètres (et signalée une fois par un message après un déverrouillage v3) : PIN v3 → mêmes PKCS#8 + preuve `verifier` → AK, DK, RK neuves → identité rescellée sous AK → `POST /init`, qui supprime `UserPinSecret`. Les clés publiques sont renvoyées **à l'identique** (chaîne stockée, pas la forme canonique), après vérification qu'elles correspondent aux clés privées. Comptes `v2:` (PIN long) : non éligibles pour l'instant (aucune preuve de PIN vérifiable par le serveur). Les comptes legacy passent d'abord en v3 au déverrouillage, comme avant.

### 13.5 Limites connues

- **Appareil retiré qui était déverrouillé** : il garde l'identité (et donc l'historique) jusqu'à une rotation d'identité (P7). L'interface du retrait le dit et conseille de changer de mot de passe.
- **Retrait = nouvelle clé de récupération** quand une récupération existe (décision 6) : l'utilisateur doit conserver la nouvelle clé.
- **Récupération par PIN** : affichée « Bientôt disponible », non simulée ; le troisième acteur (décision 3) reste à trancher.
- **Téléchargement de la clé de récupération** : lien `download` d'un fichier texte ; le comportement dans les WebView Tauri / Capacitor est à vérifier (la copie reste possible).
- `/me/initE2EE` reste sans garde pour un compte v3 déjà initialisé (antérieur à la v4, hors périmètre).

### 13.6 À valider sur de vrais appareils

Rien de ce qui suit n'a pu être lancé depuis l'environnement de développement :
- parcours complet dans l'application : création v4, déverrouillage, ajout d'un second appareil par QR et par code, retrait, clé de récupération, réinitialisation, migration d'un compte v3 ;
- lecture du QR par la caméra : `BarcodeDetector` (Chrome, Android) et `jsqr` (Firefox, Safari, WebKitGTK), permission caméra Android (ajoutée au manifeste) et iOS (`NSCameraUsageDescription` à ajouter si un projet iOS est créé) ;
- passkey PRF (Chrome, Edge, Safari ; Firefox inégal), Face ID / Touch ID, empreinte Android, trousseau Tauri ;
- téléchargement du fichier de clé de récupération dans Tauri et Capacitor.

## 14. Récupération par PIN — état de P7

### 14.1 Construction

```
x        = "synco-e4-pinrec|<userId>|<PIN>"
sortieA  = OPRF(cléA, x)     synco_api       (clé par utilisateur, PinRecovery.oprfKey)
sortieB  = OPRF(cléB, x)     synco_keyguard  (clé par utilisateur, scellée par KEYGUARD_MASTER_KEY)
K        = HKDF(sortieA ‖ sortieB, sel = "synco-e4-pinrec|<userId>")
enveloppe = AES-GCM(K_wrap, AK)  stockée par synco_api ;  jeton = HKDF(…, "verify"), SHA-256(jeton) chez chaque acteur
```

OPRF de la RFC 9497 sur P-256 (`@noble/curves` 2.4.0, côté app, API et keyguard). Le client aveugle `x` : un acteur ne voit qu'un point aléatoire et renvoie son évaluation ; il ne peut ni retrouver le PIN, ni le tester sans l'autre clé.

### 14.2 Propriétés

| Compromis | Conséquence |
|---|---|
| Base de synco_api seule (cléA, enveloppe) | Aucune force brute : il manque cléB. Chaque essai en ligne passe par le keyguard (10 au plus). |
| synco_keyguard seul (cléB, clé maîtresse) | Aucune force brute : ni enveloppe ni cléA. |
| Session Keycloak volée, ou synco_api malveillant qui rejoue des jetons | 10 essais chez chaque acteur, puis blocage ; chaque essai est notifié par e-mail. |
| **Les deux** acteurs compromis | Force brute des 10 000 PIN en quelques secondes : limite assumée, annoncée dans l'interface. |

- **Essais** : chaque évaluation est comptée (atomiquement) par chaque acteur ; 10 au plus, puis HTTP 423. Le compteur revient à zéro sur preuve de réussite (le jeton, que seul qui connaît K peut produire) ou par une réactivation depuis un appareil connecté.
- **Activation** : clé OPRF neuve chez chaque acteur, gardée en attente jusqu'à sa validation (10 min) : une activation ne peut pas servir d'oracle sur la clé active. Le keyguard est validé avant synco_api.
- **Rotation d'AK** (retrait d'appareil) : l'app redemande le code de récupération, vérifie qu'il ouvre l'enveloppe actuelle (elle doit contenir l'AK actuelle) et scelle chaque nouvelle AK sous la même K (`pinRecoveryEnvelope`). Sans code, synco_api supprime la récupération par PIN et l'app la désactive au keyguard. La réinitialisation de dernier recours la supprime aussi.
- **Isolement** : l'app appelle le keyguard directement (`VITE_KEYGUARD_URL`) avec le jeton Keycloak ; synco_api ne lui parle jamais. Le keyguard vérifie le jeton lui-même (JWKS), n'a aucune dépendance vers synco_api, tourne dans un conteneur sans privilège, en lecture seule, avec son propre volume SQLite.

### 14.3 Fichiers

| Rôle | Fichier | Testé |
|---|---|---|
| Protocole client (activation, récupération, rotation, état) | `src/assets/e2eeV4/pinRecovery.ts` | oui, acteurs simulés avec la vraie OPRF |
| Appels HTTP des deux acteurs | `src/assets/e2eeV4/pinRecoveryApi.ts` | type-check |
| Interface | `V4Gate.vue` (connexion), `DevicesSecurity.vue` (activation, retrait) | type-check, build |
| Acteur n° 1 | `synco_api` : `services/pinRecoveryService.ts`, routes `/e2ee/v4/pin-recovery`, `security/e2ee-v4-pin-recovery.db.test.ts` | oui (base locale) |
| Acteur n° 2 | dépôt `synco_keyguard` (Express, Prisma/SQLite, Docker) | oui |

### 14.4 Limites et exploitation

- **Déni de service** : une session volée peut réactiver (et donc remplacer) ou désactiver la récupération par PIN ; elle n'obtient rien, et l'utilisateur est prévenu par e-mail.
- **Évaluations non vérifiables** (OPRF simple, pas VOPRF) : un acteur qui répondrait faux ne ferait qu'empêcher la récupération.
- **Sauvegardes** : les volumes de synco_api et du keyguard ne doivent jamais être sauvegardés ensemble, et `KEYGUARD_MASTER_KEY` ne doit vivre dans aucune des deux bases.
- **Audience Keycloak** : à restreindre (`KEYCLOAK_AUDIENCE`) quand un mapper dédié existera ; la sécurité ne repose pas dessus (plafond d'essais).
- **À valider en conditions réelles** : déploiement du keyguard derrière le proxy TLS, CORS, parcours complet dans l'app (activation, récupération sur un appareil neuf, retrait avec conservation).

## 15. Rotation d'identité — état de P7

### 15.1 Principe

`rotateIdentity` (app) → `POST /e2ee/v4/rotate-identity` (API), en une transaction :
1. nouvelles paires RSA-OAEP 4096 et ECDSA P-256, nouvelle AK ;
2. **transition** `(userId, rang, ancienne clé de signature, nouvelle clé publique, nouvelle clé de signature)` signée par l'**ancienne** clé de signature ; le serveur la vérifie contre la clé qu'il stocke : une session Keycloak seule ne peut pas remplacer l'identité ;
3. chaque appareil conservé (certificat vérifié contre la clé épinglée) reçoit une enveloppe de la nouvelle AK et un **certificat signé par la nouvelle identité** ; couverture exacte exigée ; des appareils peuvent être retirés dans la même opération ;
4. l'ancienne clé privée RSA rejoint l'**archive d'identité**, scellée par la nouvelle AK (`User.identityArchive`), avec la clé de récupération renouvelée et la récupération par PIN conservée sur demande.

### 15.2 Effets

- **Ses propres appareils** : au déverrouillage, une identité différente de celle épinglée n'est acceptée que si une chaîne de transitions signées part de l'identité épinglée et y aboutit exactement ; le pin local est alors mis à jour. Sans chaîne valide : `IdentityMismatchError` (défense du §7 inchangée).
- **Historique** : tous les déchiffrements RSA de l'identité courante (`crypto.ts`, `rsaDecrypt`) se rabattent sur les clés archivées ; DM, clés de salons, d'espaces, de sessions IA et partages de clé d'équipe scellés pour l'ancienne clé restent lisibles. Toute rotation d'AK rescelle l'archive (exigée par l'API dès qu'elle existe).
- **Autres membres** (`keyTrust`) : une clé RSA ou de signature changée est acceptée sans alerte seulement si la chaîne `GET /e2ee/v4/users/:id/transitions` part de la clé de signature **épinglée localement** pour ce membre et aboutit à la clé présentée. Sinon, comportement d'avant : alerte (RSA) ou refus (signature).

### 15.3 Limites

- **Clés symétriques déjà vues** : un appareil volé qui connaissait des `ThreadKey` / `WorkspaceKey` les garde ; seule leur rotation par les membres (mécanismes existants de version de clé) l'en prive. Il perd en revanche les DM et les clés distribuées après la rotation.
- **Membre sans clé de signature épinglée** pour l'utilisateur qui a tourné : la chaîne n'est pas vérifiable, il voit l'alerte habituelle de changement de clé.
- **Appareil volé déverrouillé plus rapide que le propriétaire** : il détient l'ancienne clé de signature et peut, lui aussi, signer une transition. La parade reste la même que pour la rotation d'AK : réagir vite (mot de passe Keycloak changé, sessions révoquées) ; les notifications e-mail signalent chaque rotation.
- La réinitialisation de dernier recours ne produit pas de transition (l'ancienne identité est perdue) : les membres voient l'alerte de changement de clé, comme avant la v4.

