# Recette manuelle : coffre de l'extension (E2EE v4, §16)

Les tests automatiques (`bun test`) valident la logique avec une fenêtre et un port simulés. **Ils ne prouvent pas que le
coffre fonctionne dans un navigateur.** Cette liste couvre ce que seul un navigateur réel avec la vraie extension peut
confirmer. À rejouer dans **Chrome** et dans **Firefox**.

Spécification de l'intégration : [§16 de la spec v4](13-e2ee-v4-multi-appareil.md#16-coffre-de-lextension). Contrat de
l'extension : [`doc/16-coffre-extension.md`](https://github.com/SilverCore-Git/synco_extension/blob/main/doc/16-coffre-extension.md)
et sa propre [recette](https://github.com/SilverCore-Git/synco_extension/blob/main/doc/recette-manuelle.md), qui couvre
l'extension seule (R01 à R63) : cette liste-ci ne la remplace pas.

Légende : ✅ conforme · ❌ écart (noter le message exact) · ➖ non applicable.

## 0. Préparation

1. **Construire l'extension** (build de développement, qui n'autorise que `https://localhost:5174`), depuis l'hôte :
   `host-spawn sh -c 'cd /home/moi/Documents/GitHub/synco_extension && node scripts/build.mjs --dev'`
   → `dist/chrome` et `dist/firefox`. Reconstruire à chaque changement de l'extension.
2. **Chrome** : `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → `dist/chrome`.
3. **Firefox** : `about:debugging#/runtime/this-firefox` → « Charger un module complémentaire temporaire » →
   `dist/firefox/manifest.json`, puis `about:addons` → Synco Extension (dev) → Autorisations : accorder l'accès au site.
   - Un module temporaire est **supprimé à la fermeture de Firefox**, clés comprises : fermer le navigateur équivaut à
     désinstaller l'extension (voir E31). Faire toute la recette dans la même session.
   - Rester dans **la même fenêtre** que `about:debugging` si plusieurs profils sont ouverts. Ne pas laisser la console de
     l'extension ouverte pendant les tests de mise en veille.
4. **Application** : `bun run dev` (HTTPS auto-signé, port 5174, avec l'API et Keycloak de développement habituels), ouvrir
   `https://localhost:5174/` et recharger (F5). Une autre adresse (`https://<ip>:5174`) n'est pas acceptée par l'extension :
   le coffre y est absent (E02).
5. **Navigateur sans passkey de plateforme** pour passer par l'extension : Firefox sous Linux, ou Chrome sous Linux sans
   gestionnaire de passkeys. Avec un authentificateur de plateforme, la passkey passe avant l'extension (E03).
6. **Un compte v4 de test** avec au moins un autre appareil déjà connecté (pour la liaison et pour la reconnexion).
7. Console de la page ouverte (F12) : **aucune** ligne ne doit mentionner un PIN, une clé ou « dk » pendant toute la recette.

## 1. Détection

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E01 | Charger la page avec l'extension active et l'accès au site accordé | Le démarrage n'est pas retardé de façon perceptible ; sur l'écran de création ou de liaison, la phrase « Cet appareil se déverrouille avec… » cite Synco Extension | | |
| E02 | Même test sur `https://<ip>:5174` (adresse réseau) | Aucune détection : le PIN local est proposé, comme sans extension | | |
| E03 | Chrome avec un authentificateur de plateforme (Touch ID, Windows Hello, gestionnaire de passkeys), extension active | Si le navigateur annonce la prise en charge de la passkey avec PRF (console : `await PublicKeyCredential.getClientCapabilities()` → `userVerifyingPlatformAuthenticator` et `extension:prf` à `true`), la passkey est proposée avant l'extension ; sinon l'extension passe devant **sans aucune invite WebAuthn** | | ➖ |
| E03b | Firefox, même vérification | Noter la valeur de `extension:prf` ; absente ou `false` : aucune invite passkey, jamais deux fenêtres à annuler | ➖ | |
| E04 | Sans extension (désactivée), recharger | PIN local comme avant, aucun message d'erreur au démarrage | | |

## 2. Inscription par l'extension

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E05 | Nouvel appareil : QR affiché, le valider depuis l'autre appareil, comparer les codes, « Les codes correspondent » | La carte « Répondez dans Synco Extension » apparaît ; une **fenêtre de l'extension** s'ouvre : origine `https://localhost:5174`, raison « Protéger les clés de cet appareil », boutons « Autoriser » et « Annuler », **aucun code** à saisir | | |
| E06 | Cliquer « Autoriser » | L'appareil s'inscrit, la session s'ouvre ; aucun code n'a été demandé, ni dans la page ni dans la fenêtre | | |
| E07 | Dans les options de l'extension (popup → réglages) | Une entrée « vault » pour `https://localhost:5174` avec l'identifiant de cet appareil (UUID) | | |
| E08 | DevTools de la page → Application → IndexedDB | Aucune entrée `e4-pinvault:…` pour cet appareil ; `e4-device:<utilisateur>` contient `vaultKind: "extension"` et une clé privée scellée, pas de DK | | |
| E09 | Création de compte (compte neuf) avec l'extension | Même fenêtre d'accord ; la clé de récupération s'affiche ensuite normalement | | |
| E10 | Fermer la fenêtre de l'extension (croix) pendant l'inscription | « Opération annulée » avec la mention de la fenêtre et d'un éventuel autre onglet ; **aucun repli silencieux** vers le PIN local ; l'appareil n'est pas enregistré | | |
| E11 | Après E10, « Utiliser plutôt un code PIN local » (création de compte) | Le PIN local se choisit dans la page, l'appareil s'inscrit avec `web-pin` | | |

## 3. Déverrouillage

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E12 | Recharger la page (verrou de l'appareil : l'extension) | Aucun bouton à presser : la carte « Répondez dans Synco Extension » apparaît et la fenêtre de l'extension s'ouvre d'elle-même ; **jamais** « vérifiée » | | |
| E13 | Cliquer « Autoriser » | La carte affiche « Déverrouillé », la session s'ouvre, la carte disparaît | | |
| E14 | Recharger, puis **Annuler** dans la carte de la page | Aucun message d'erreur ; la fenêtre de l'extension **se ferme aussitôt** ; l'écran propose « Réessayer avec l'extension » et « Utiliser une autre méthode » ; l'appareil reste inscrit | | |
| E15 | Cliquer « Déverrouiller », puis fermer la fenêtre de l'extension | Annulation, l'appareil reste inscrit, on peut recommencer | | |
| E16 | **Ancien enregistrement (format 1)** : appareil inscrit avec une version de l'extension qui demandait un PIN, extension mise à jour, recharger | La fenêtre demande le PIN **une dernière fois** ; au bon PIN la session s'ouvre ; au chargement suivant, un simple « Autoriser » | | |
| E17 | Format 1 : mauvais PIN dans la fenêtre | Refusé **dans la fenêtre**, qui redemande ; la page reste sur la carte d'attente tant que la saisie n'est pas terminée | | |
| E18 | Format 1 : six mauvais PIN | À la 6ᵉ erreur : pavé bloqué et compte à rebours **dans la fenêtre** ; la fermer : annulation côté page | | |
| E19 | Format 1 : **10ᵉ échec** (procédure R17 de la recette de l'extension pour lever les délais à partir de la 6ᵉ erreur) | La fenêtre indique la clé effacée ; la page dit que Synco Extension a effacé les clés de cet appareil et passe à l'écran de liaison ; l'appareil est oublié localement | | |
| E20 | Ouvrir 4 fois de suite la fenêtre de l'extension en moins d'une minute (recharger, fermer la fenêtre, ×4) | À la 4ᵉ demande : `locked` sans fenêtre (3 fenêtres par minute et par origine), compte à rebours dans la page | | |

## 4. Extension absente, désactivée, mise à jour

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E21 | Désactiver l'extension (`chrome://extensions` / `about:addons`), recharger la page | Panneau « Synco Extension ne répond pas » avec les consignes Chrome et Firefox ; **l'appareil n'est pas oublié** ; « Autre méthode » reste disponible | | |
| E22 | Réactiver l'extension **sans recharger**, cliquer « Réessayer » | **Noter** si le handshake aboutit ou si « ne répond toujours pas… rechargez la page » s'affiche (un content script n'est normalement injecté qu'au chargement). Dans tous les cas, après rechargement : fenêtre de l'extension, session ouverte | | |
| E23 | Retirer l'accès au site (Chrome : Détails → Accès au site ; Firefox : Autorisations), recharger | Même panneau qu'en E21 | | |
| E24 | Rendre l'accès, recharger, déverrouiller | Déverrouillage normal : la clé n'a pas été perdue | | |
| E25 | Pendant que la page est ouverte et déverrouillée, **recharger l'extension** (bouton « Recharger » / « Reload ») puis « Verrouiller la session » et « Déverrouiller » sans recharger la page | Port mort : délai, message clair « ne répond plus… rechargez la page » ; après rechargement de la page, tout fonctionne | | |
| E26 | Chrome : arrêter le worker (`chrome://serviceworker-internals` → Stop), puis déverrouiller | Le worker se réveille, déverrouillage normal | | ➖ |
| E27 | Laisser la fenêtre de l'extension ouverte plus de 2 minutes | La fenêtre expire, la page affiche l'annulation ; l'appareil reste inscrit | | |
| E28 | Déverrouiller, recharger la page pendant que la fenêtre est ouverte | La fenêtre reste ouverte jusqu'à son délai ; la clé obtenue ne parvient à personne ; le déverrouillage suivant est possible | | |

## 4b. Carte d'attente et fenêtre de l'extension

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E50 | Lier un appareil, comparer les deux codes, « Les codes correspondent » | Une carte apparaît par-dessus la page : « Répondez dans Synco Extension », un indicateur d'attente, « Annuler » | | |
| E51 | Observer la fenêtre de l'extension (navigateur d'au moins 880 px de large) | La carte de Synco se pousse à gauche et la fenêtre de l'extension s'ouvre **juste à sa droite, au même niveau** : les deux forment une paire centrée sur la page ; elle est basse (environ 560 px) et ne défile pas ; aucune passkey n'a été proposée avant. Sous 880 px : fenêtre centrée, carte au milieu. Sous Wayland, le navigateur peut ignorer la position demandée : noter où la fenêtre apparaît | | |
| E52 | Cliquer « Autoriser » dans la fenêtre | La fenêtre affiche « Appareil protégé » en grand, la carte de la page aussi, puis les deux se ferment d'elles-mêmes (environ 1,5 s) | | |
| E53 | Cliquer « Annuler » **dans la fenêtre de l'extension** | La carte de la page se ferme et le message d'annulation habituel s'affiche | | |
| E54 | Cliquer « Annuler » dans la carte de la page | La carte se ferme **sans message d'erreur** et la fenêtre de l'extension se ferme aussitôt ; la page revient à l'écran précédent et on peut recommencer | | |
| E55 | Fermer la fenêtre de l'extension avec la croix | La carte de la page se ferme et le message d'annulation habituel s'affiche | | |
| E56 | Système réglé sur « réduire les animations » | Indicateur d'attente ralenti, aucune autre animation ; les états restent lisibles | | |
| E57 | Thème clair puis sombre de Synco | La carte est lisible dans les deux | | |
| E59 | Appareil verrouillé par l'extension, ouvrir Synco dans un onglet en arrière-plan (clic molette) | **Aucune fenêtre** tant que l'onglet n'est pas affiché ; elle s'ouvre à l'affichage, une seule fois | | |
| E60 | Après E59, « Annuler » dans la carte | La carte se ferme ; l'écran propose « Réessayer avec l'extension » et « Utiliser une autre méthode » (qui mène aux autres moyens de connexion) | | |
| E61 | Extension plus ancienne (sans l'opération `cancel`) | « Annuler » ferme la carte de la page sans message d'erreur ; la fenêtre de l'extension se ferme d'elle-même au bout de 2 minutes | | |

## 5. Extension désinstallée

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E29 | Désinstaller l'extension, recharger la page | Panneau « ne répond pas » : tant qu'on ne sait pas si elle reviendra, l'appareil n'est pas oublié | | |
| E30 | Réinstaller l'extension (nouveau profil de stockage), recharger, déverrouiller | « Synco Extension ne contient plus de clé pour cet appareil… » (`missing`) ; l'appareil est oublié et l'écran de liaison s'affiche | | |
| E31 | **Firefox** : fermer et rouvrir le navigateur (module temporaire supprimé), recharger l'application | Même résultat qu'en E29 puis E30 après avoir rechargé le module | ➖ | |
| E32 | Se reconnecter depuis l'autre appareil (QR) puis par la clé de récupération | Les deux chemins de secours fonctionnent et inscrivent l'appareil avec l'extension | | |

## 6. Changement de verrou (Paramètres › Appareils › Verrou de cet appareil)

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E33 | Appareil sous PIN local → « Changer de verrou » | La liste déroulante propose Synco Extension (et la passkey si WebAuthn existe), sans rangée de boutons | | |
| E34 | Choisir Synco Extension | Confirmation « Passer à Synco Extension ? » : ouvrir avec le PIN local, puis « Autoriser » dans la fenêtre de l'extension, et l'avertissement « Désinstaller l'extension efface les clés… » ; après confirmation : PIN local dans la page, puis fenêtre de l'extension ; « Cet appareil se déverrouille désormais avec Synco Extension » | | |
| E35 | Recharger | La fenêtre de l'extension s'ouvre d'elle-même, « Autoriser » suffit ; aucun PIN local n'est plus demandé ; `e4-pinvault:…` a disparu d'IndexedDB | | |
| E36 | Extension → Code PIN local | Confirmation, nouveau code dans la page, « Autoriser » dans la fenêtre de l'extension pour ouvrir l'ancien verrou ; ensuite l'entrée `vault:` de l'extension a disparu de ses options | | |
| E37 | Extension → Passkey (Chrome avec authentificateur) | Fenêtre de l'extension, puis invite passkey ; si la passkey n'a pas de PRF : message clair, l'extension reste le verrou actif | | ➖ |
| E38 | Pendant E34, cliquer **Annuler** dans le bandeau d'attente | Rien ne change : le PIN local fonctionne toujours, aucune entrée d'extension n'est restée | | |
| E39 | Pendant E36, désactiver l'extension avant de confirmer | Le changement est refusé avec un message clair ; le verrou reste l'extension | | |
| E40 | Verrou extension : réglage « Verrou de cet appareil » | Aucun bouton de changement de code (l'extension n'en a plus) ; « Ce qu'il ne protège pas » mentionne le vol de l'ordinateur et la session ouverte | | |
| E41 | Opération sensible avec le verrou extension (retirer un appareil, répondre à une liaison, régénérer la clé de récupération) | Le bandeau d'attente s'affiche **au-dessus** de la confirmation ; la fenêtre de l'extension s'ouvre ; l'opération aboutit | | |

## 7. Deux onglets

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E42 | Deux onglets Synco ouverts sur l'écran de déverrouillage ; la fenêtre de l'onglet 1 est ouverte, cliquer « Réessayer avec l'extension » dans l'onglet 2 | L'onglet 2 reçoit une annulation (une seule fenêtre à la fois) avec la mention d'un autre onglet ; l'onglet 1 n'est pas perturbé | | |
| E43 | « Autoriser » dans l'onglet 1, puis « Réessayer avec l'extension » dans l'onglet 2 | L'onglet 2 ouvre sa propre fenêtre (une par demande) et se déverrouille | | |
| E44 | Changer de verrou (PIN local → extension) dans l'onglet 1 ; l'onglet 2, resté ouvert sur l'écran de déverrouillage, essaie de déverrouiller | Jamais de perte silencieuse de l'appareil. **Noter** surtout si l'onglet 2 affiche encore un clavier PIN dans la page alors que le verrou est l'extension (état de l'onglet périmé) | | |

## 8. Sécurité (à jouer une fois par navigateur)

| # | Étape | Résultat attendu | Chrome | Firefox |
| --- | --- | --- | :-: | :-: |
| E45 | Onglet Réseau de la page pendant E05 à E36 | Aucune requête ne contient de PIN, de DK ni de clé ; l'extension n'émet elle-même aucune requête réseau | | |
| E46 | Console de la page pendant toute la recette | Aucune ligne mentionnant un PIN, une clé ou « dk » | | |
| E47 | Console de la page, avec l'outil de la recette de l'extension : envoyer un `hello` de forme incorrecte (clé en trop, protocole `2`) | Aucun `ready` pour la forme incorrecte ; `unsupported` pour le protocole `2`, qui est traité comme « extension absente » | | |
| E48 | Vérifier le texte de l'interface | **Jamais** « vérifiée », « authentique » ou « sécurisée par l'extension » ; dans le réglage, la limite de l'extension (vol de l'ordinateur, session ouverte) et celle du PIN local figurent sous « Ce qu'il ne protège pas » | | |
| E49 | Appeler le coffre depuis la console de la page (outil `__synco` de la recette de l'extension, §0 : `hello` puis `load` avec l'identifiant de l'appareil) | Une fenêtre de l'extension s'ouvre : c'est la limite documentée (M2) ; **ne pas autoriser**. Annuler | | |

## Résumé à renvoyer

Pour chaque ❌ : navigateur et version, numéro de la ligne, message exact affiché, et ce que la console de la page et celle
de l'extension (Chrome : « service worker » → Inspecter ; Firefox : « Inspecter ») montrent. Ne copier ni PIN ni clé.

Depuis le format 2 de l'extension (accord « Autoriser », sans PIN), les lignes E16 à E19 ne concernent que les
enregistrements créés par une version antérieure de l'extension : les jouer avec une telle version si elle est encore
disponible, sinon les marquer ➖.

**Non rejouable à la main** : un faux `ready` (sans port, autre source, autre origine, forme inexacte) pendant la détection de 300 ms. Il est couvert par les tests automatiques seulement.
