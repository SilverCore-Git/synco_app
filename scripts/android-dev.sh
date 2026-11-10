#!/usr/bin/env bash
# Compile Synco pour Android (build de débogage), l'installe sur le téléphone branché en USB et relie ses ports
# « localhost » à ceux de ce PC (adb reverse) : l'app du téléphone joint l'API, le socket, le CDN… du poste de dev
# sans changer les .env, sans ouvrir le pare-feu, avec le certificat de dev (qui couvre localhost).
#
# Prérequis (une fois) : JDK 21 dans ~/.local/share/jdk, SDK Android dans ~/Android/Sdk (licences acceptées),
# téléphone en mode développeur avec le débogage USB, autorité « Synco Dev CA » installée sur le téléphone.
# Voir doc/android-dev.md.
#
# Usage : scripts/android-dev.sh            build + installation + ports + lancement
#         scripts/android-dev.sh --ports    seulement les ports (après avoir rebranché le téléphone)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="fr.silvercore.synco"

JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/.local/share/jdk/jdk-21* 2>/dev/null | sort | tail -1)}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

fail() { echo "✖ $*" >&2; exit 1; }

[ -x "$JAVA_HOME/bin/java" ] || fail "JDK 21 introuvable (JAVA_HOME=$JAVA_HOME). Voir doc/android-dev.md."
command -v adb >/dev/null || fail "adb introuvable : composants du SDK non installés. Voir doc/android-dev.md (sdkmanager)."

# Un seul téléphone autorisé
devices=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
unauthorized=$(adb devices | awk 'NR>1 && $2=="unauthorized" {print $1}')
[ -n "$unauthorized" ] && fail "Téléphone non autorisé : acceptez « Autoriser le débogage USB » sur son écran, puis relancez."
[ -n "$devices" ] || fail "Aucun téléphone détecté : branchez-le en USB, débogage USB activé (voir doc/android-dev.md)."
[ "$(echo "$devices" | wc -l)" -eq 1 ] || fail "Plusieurs appareils branchés : n'en gardez qu'un."

# Ports localhost des URL du .env de l'app (API, socket, CDN, keyguard, LiveKit, PeerJS)
reverse_ports() {
  local ports
  ports=$(grep -E '^VITE_[A-Z_]+=' "$APP_DIR/.env" | grep -oE 'localhost:[0-9]+' | cut -d: -f2 | sort -u)
  local peer_port
  peer_port=$(grep -E '^VITE_PEER_PORT=' "$APP_DIR/.env" | cut -d= -f2 | tr -d '"' || true)
  [ -n "$peer_port" ] && ports=$(printf '%s\n%s\n' "$ports" "$peer_port" | sort -u)
  for p in $ports; do
    adb reverse "tcp:$p" "tcp:$p" >/dev/null
  done
  echo "✔ Ports reliés au PC : $(echo $ports | tr ' ' ',')"
}

if [ "${1:-}" = "--ports" ]; then
  reverse_ports
  exit 0
fi

cd "$APP_DIR"
echo "▸ Build web (mode development : .env, CSP de dev)"
node ./node_modules/vite/bin/vite.js build --mode development >/dev/null

echo "▸ Synchronisation Capacitor"
node ./node_modules/@capacitor/cli/bin/capacitor sync android >/dev/null

echo "▸ Compilation de l'APK de débogage"
(cd android && ./gradlew --quiet assembleDebug)
APK="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || fail "APK introuvable : $APK"

echo "▸ Installation sur le téléphone"
adb install -r "$APK" >/dev/null

reverse_ports

adb shell am start -n "$APP_ID/.MainActivity" >/dev/null
echo "✔ Synco est lancée sur le téléphone."
