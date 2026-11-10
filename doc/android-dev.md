# Tester Synco sur un téléphone Android (développement)

Le téléphone est branché en USB. `adb reverse` relie ses ports `localhost` à ceux du PC : l'app du téléphone joint
l'API, le socket, le CDN, le keyguard, LiveKit et PeerJS du poste de développement **sans changer les `.env`**, sans
ouvrir le pare-feu, avec le certificat de dev (qui couvre `localhost`). Seule Keycloak reste distante.

## Une fois pour toutes

### Sur le PC

1. **JDK 21** (le projet Android ne compile pas avec Java 25) : installé dans `~/.local/share/jdk/jdk-21.0.13+9`
   (Temurin). Le script le trouve tout seul.
2. **SDK Android** : outils en ligne de commande dans `~/Android/Sdk`. Installer les composants (les licences Google
   s'affichent : les lire et répondre `y`) :

   ```sh
   JAVA_HOME=~/.local/share/jdk/jdk-21.0.13+9 ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager \
     --sdk_root="$HOME/Android/Sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
   ```

3. **Origines CORS** : l'app Android a pour origine `https://localhost` (Capacitor). Elle doit être acceptée par :
   - `synco_api/.env` : `ALLOWED_ORIGINS="https://localhost:5174,https://localhost"` ;
   - `synco_keyguard/.env` : `KEYGUARD_ALLOWED_ORIGINS=https://localhost:5174,https://localhost` ;
   - `synco_cdn/.env` : `"https://localhost"` dans `CDN_CORS_ALLOWED_ORIGINS`.

   Puis redémarrer l'API, le keyguard et le conteneur du CDN.
4. **Keycloak** : le client public doit accepter l'URI de redirection `fr.silvercore.synco://callback` (connexion
   depuis l'app mobile).

### Sur le téléphone

1. **Mode développeur** : Paramètres › À propos du téléphone › appuyer 7 fois sur « Numéro de build ».
2. **Débogage USB** : Paramètres › Système › Options pour les développeurs › activer « Débogage USB ».
3. **Autorité de dev** : copier `synco_api/certs/dev-ca.crt` sur le téléphone, puis Paramètres › Sécurité ›
   Chiffrement et identifiants › Installer un certificat › **Certificat CA**. Seuls les builds de débogage de Synco
   lui font confiance (`network_security_config.xml`, section `debug-overrides`) ; une version publiée, jamais.
4. **Verrouillage d'écran** (code + empreinte ou visage) : sans lui, Synco refuse de protéger la clé de l'appareil.

## À chaque test

Téléphone branché et déverrouillé (accepter « Autoriser le débogage USB » la première fois), serveurs de dev lancés :

```sh
bun run android:dev      # build web + APK de débogage, installation, ports, lancement
bun run android:ports    # seulement les ports, après avoir débranché/rebranché le téléphone
```

## Ce qu'il faut vérifier (doc/securite/13-e2ee-v4-multi-appareil.md §13.6)

- Connexion Keycloak depuis l'app (navigateur système, retour dans l'app).
- Première inscription au chiffrement : invite biométrique Android, puis clé de récupération.
- Fermer et rouvrir l'app : déverrouillage par empreinte ; « Annuler » puis code de l'appareil.
- Liaison d'un second appareil : scan du QR (permission caméra).
- Téléphone sans verrouillage d'écran : message « Activez un verrouillage d'écran ».
