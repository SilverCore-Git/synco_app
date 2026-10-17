# 13 — E2EE v4 : multi-appareil, secret matériel, PIN purement local (SPÉCIFICATION)

| | |
|---|---|
| **Statut** | 📝 Spécification — branche `feat/e2ee-v4` (synco_app et synco_api). Rien n'est encore implémenté. |
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
        │  enveloppée par appareil, et par la clé de récupération
        ▼
┌ DeviceKey (DK)       256 bits aléatoires, propre à CHAQUE appareil, stockée dans son coffre matériel
│  └ DeviceEnvelope    AES-GCM(DK, AK) — stockée sur le serveur, inutilisable sans DK
└ RecoveryKey (RK)     256 bits, montrée une seule fois à l'utilisateur
   └ RecoveryEnvelope  AES-GCM(HKDF(RK), AK) — stockée sur le serveur
```

- **Le serveur ne voit jamais** : AK, DK, RK, ni le PIN. Il stocke uniquement des enveloppes chiffrées.
- **Compromission du serveur seul** : l'attaquant obtient des enveloppes qu'il ne peut ouvrir sans DK (coffre matériel d'un appareil) ni RK. Aucune force brute possible : il n'existe pas de secret faible à tester.
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
1. Le **nouvel appareil** génère une paire éphémère ECDH P-256 et affiche un **QR code** contenant sa clé publique et un identifiant de demande (lien de secours : code court à saisir).
2. Un **appareil déjà connecté** scanne le QR (canal hors bande : le serveur ne peut pas substituer la clé), affiche le nom et la plateforme du nouvel appareil et demande une confirmation explicite.
3. Il calcule ECDH + HKDF, chiffre AK pour le nouvel appareil et dépose cette enveloppe temporaire sur le serveur (`DeviceLinkRequest`, valable quelques minutes, usage unique).
4. Le nouvel appareil la récupère, ouvre AK, génère sa propre DK, enregistre son `DeviceEnvelope` et détruit l'enveloppe temporaire.
5. Un **code de vérification** à 6 chiffres, dérivé de l'échange et affiché des deux côtés, couvre le cas de saisie manuelle sans QR (anti-MITM du serveur).

### 4.4 Aucun autre appareil disponible
1. **Clé de récupération** : l'utilisateur la saisit, l'app ouvre `RecoveryEnvelope`, puis enregistre l'appareil comme en 4.3 (étapes 4).
2. **Sans clé de récupération** : voir §6 (récupération par PIN, plus faible et explicitement présentée comme telle). En dernier recours, réinitialisation avec perte de l'historique (comportement actuel).

### 4.5 Retirer un appareil perdu
Suppression de son `DeviceEnvelope`, puis **rotation d'AK** : nouvelle AK, réenveloppement de l'identité et des appareils restants. Un appareil volé avec son coffre déverrouillé connaît encore l'identité : voir §7 pour la rotation d'identité, hors périmètre de la première version.

## 5. Modèle serveur (esquisse)

```
UserDevice        id, userId, name, platform, deviceEnvelope (b64), createdAt, lastUsedAt, revokedAt
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

- `serverSecret` : stocké dans la base de `synco_api`, libéré après vérification du jeton et limitation d'essais.
- `thirdPartySecret` : détenu par un **troisième acteur** (service de clés dédié, ou Keycloak via un client/une audience réservés dont le jeton n'est **jamais** envoyé à `synco_api`).
- Un attaquant doit alors compromettre **les deux** composants et connaître le PIN ; en revanche, qui obtient les deux secrets force 10 000 PIN en quelques secondes.
- Activation **explicite** par l'utilisateur, avec avertissement. Désactivable (toute la sécurité repose alors sur les appareils et la clé de récupération).

## 7. Limites assumées

- **Web sans PRF** : le PIN à 4 chiffres est la seule barrière contre quelqu'un qui copie le profil du navigateur. Les navigateurs n'offrent pas de limiteur d'essais matériel. C'est l'état de l'art pour le web et c'est signalé à l'utilisateur.
- **Appareil volé déverrouillé** : il connaît l'identité jusqu'à sa rotation. La rotation d'identité (nouvelles paires RSA/ECDSA et redistribution des clés symétriques) est un chantier à part.
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
| **P1** | Noyau cryptographique pur et testé : AK, enveloppes, liaison d'appareil (ECDH + SAS), clé de récupération, formats versionnés |
| **P2** | API : schéma Prisma, routes (appareils, liaison, récupération), limitation de débit, notifications, tests |
| **P3** | Coffres par plateforme : web (PRF/IndexedDB), Capacitor (biométrie native), Tauri |
| **P4** | Interface : onboarding, clé de récupération, liste des appareils, liaison par QR, déverrouillage |
| **P5** | Migration v3 → v4 et suppression du matériel PIN côté serveur |
| **P6** | Révocation d'appareil avec rotation d'AK |
| **P7** | Récupération par PIN durcie (troisième acteur) et, plus tard, rotation d'identité |

Chaque phase est committée séparément, avec ses tests, et reste compatible avec les comptes existants.

## 10. Décisions

| # | Question | Décision |
|---|---|---|
| 1 | Clé de récupération | **Proposée au téléchargement à la création du compte** (non forcée). |
| 2 | Récupération par PIN (§6) | **Proposée** à l'utilisateur, avec avertissement sur sa moindre sécurité. |
| 3 | Troisième acteur (§6) | *À trancher* : Keycloak avec client réservé, ou petit service de clés séparé ; même opérateur ou non. |
| 4 | Migration v3 → v4 (§8) | **Proposée** (pas imposée dans un premier temps). |
| 5 | Retrait d'un appareil (§4.5) | *À confirmer* : rotation d'AK seule en v1, rotation d'identité plus tard. |
