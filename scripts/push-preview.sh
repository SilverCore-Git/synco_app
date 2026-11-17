#!/usr/bin/env bash
# Aperçu des notifications push sur un téléphone branché en ADB, sans serveur ni Firebase.
# Prérequis : build « preview » installé à côté de l'app (fr.silvercore.synco.preview) :
#   cd android && ./gradlew installPreview
#
# Usage : scripts/push-preview.sh [--legacy] [scénario…]
#   sans scénario : tous ;  list : la liste ;  --legacy : ancien format, dessiné par le SDK Firebase
#
# Format natif (défaut) : comme fcmService.nativeAndroidMessage (synco_api) l'envoie, dessiné par
# SyncoNotifications.java. La photo de profil de « Julie Martin » est servie par un petit serveur HTTP
# local (adb reverse, port 8765) ; « Thomas Leroy » n'en a pas → initiales.
# Les titres/textes reprennent ceux de synco_api (notificationService.sendPushNotification et call sites).
set -euo pipefail

ADB=${ADB:-$(command -v adb || echo "$HOME/Android/Sdk/platform-tools/adb")}
COMPONENT=fr.silvercore.synco.preview/fr.silvercore.synco.PushPreviewReceiver
PORT=8765
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/synco-push-preview

legacy=0
if [[ ${1:-} == --legacy ]]; then legacy=1; shift; fi

# type | titre | texte | expéditeur | conversation
declare -A S=(
  [message_space]="MESSAGE|Nouveau message de Julie Martin|Nouveau message dans Marketing|Julie Martin|thread:marketing"
  [message_dm]="MESSAGE|Nouveau message de Thomas Leroy|Message privé|Thomas Leroy|dm:thomas"
  [mention_dm]="MENTION|Vous avez été mentionné|Julie Martin vous a mentionné|Julie Martin|dm:julie"
  [mention_thread]="MENTION|Vous avez été mentionné dans général|Thomas Leroy vous a mentionné|Thomas Leroy|thread:general"
  [task]="TASK_ASSIGNED|Nouvelle tâche|Une tâche vous a été assignée : Préparer la démo client||"
  [event]="EVENT_INVITE|Invitation à un événement|Vous avez été invité(e) à \"Point hebdo produit\"||"
  [reminder]="EVENT_REMINDER|Rappel d'événement|\"Point hebdo produit\" commence bientôt.||"
  [missed_call]="MISSED_CALL|Appel manqué|Julie Martin a essayé de vous appeler|Julie Martin|"
)
declare -A CALLS=(
  [call]="kind=call|callerId=preview-caller|callerName=Julie Martin"
  [meet]="kind=meet|callerId=preview-meet|callerName=Thomas Leroy"
  [call_end]="kind=call_end|callerId=preview-caller"
)
ORDER=(message_space message_dm mention_dm mention_thread task event reminder missed_call)

if [[ ${1:-} == list ]]; then printf '%s\n' "${ORDER[@]}" "${!CALLS[@]}"; exit 0; fi
names=("$@"); [[ ${#names[@]} -eq 0 ]] && names=("${ORDER[@]}")

# Photo de test servie au téléphone par la boucle locale (cleartext autorisé vers localhost).
start_avatar_server() {
  mkdir -p "$CACHE"
  [[ -f $CACHE/julie.jpg ]] || magick -size 256x256 plasma:orange-purple -blur 0x3 "$CACHE/julie.jpg"
  if ! curl -sf -o /dev/null "http://localhost:$PORT/julie.jpg"; then
    (cd "$CACHE" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
    sleep 0.5
  fi
  "$ADB" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
}

avatar_for() {
  case $1 in
    "Julie Martin") echo "http://localhost:$PORT/julie.jpg" ;;
    *) echo "" ;;
  esac
}

broadcast() {
  local args=""
  for pair in "$@"; do
    local key=${pair%%=*} value=${pair#*=}
    [[ -z $value ]] && continue
    value=${value//\'/\'\\\'\'}
    args+=" --es $key '$value'"
  done
  "$ADB" shell "am broadcast -n $COMPONENT -a fr.silvercore.synco.DEBUG_PUSH$args" > /dev/null
}

[[ $legacy == 0 ]] && start_avatar_server

# Le SDK Firebase comme SyncoNotifications n'affichent rien dans le volet si l'app est au premier plan.
"$ADB" shell input keyevent KEYCODE_HOME

i=0
for name in "${names[@]}"; do
  i=$((i + 1))
  if [[ -n ${CALLS[$name]:-} ]]; then
    IFS='|' read -ra pairs <<< "${CALLS[$name]}"
    broadcast "${pairs[@]}"
  elif [[ -n ${S[$name]:-} ]]; then
    IFS='|' read -r type title body sender conversation <<< "${S[$name]}"
    if [[ $legacy == 1 ]]; then
      image=""; [[ -n $sender ]] && image="https://ui-avatars.com/api/?name=${sender// /+}&background=128a60&color=fff"
      broadcast "type=$type" "notificationId=preview-$i" "route=/" "title=$title" "body=$body" "image=$image"
    else
      read=""; [[ $type == MESSAGE || $type == MENTION ]] && read="http://localhost:$PORT/read?n=preview-$i"
      broadcast "type=$type" "notificationId=preview-$i" "route=/" "n.title=$title" "n.body=$body" \
        "n.sound=default" "n.sender=$sender" "n.avatar=$(avatar_for "$sender")" "n.read=$read" "n.conversation=$conversation"
    fi
  else
    echo "scénario inconnu : $name" >&2; exit 1
  fi
  echo "→ $name"
  sleep 1
done
