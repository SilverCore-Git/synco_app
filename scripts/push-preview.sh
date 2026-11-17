#!/usr/bin/env bash
# Aperçu des notifications push sur un téléphone branché en ADB, sans serveur ni Firebase.
# Prérequis : build « preview » installé à côté de l'app (fr.silvercore.synco.preview) :
#   cd android && ./gradlew installPreview
# Usage : scripts/push-preview.sh [scénario…]   (sans argument : tous les scénarios ; `list` pour la liste)
# Les titres/textes reprennent ceux de synco_api (notificationService.sendPushNotification et call sites).
set -euo pipefail

ADB=${ADB:-$(command -v adb || echo "$HOME/Android/Sdk/platform-tools/adb")}
COMPONENT=fr.silvercore.synco.preview/fr.silvercore.synco.PushPreviewReceiver
avatar() { echo "https://ui-avatars.com/api/?name=${1// /+}&background=128a60&color=fff"; }

# shellcheck disable=SC2054
declare -A S=(
  [message_space]="type=MESSAGE|title=Nouveau message de Julie Martin|body=Nouveau message dans Marketing|image=$(avatar 'Julie Martin')"
  [message_dm]="type=MESSAGE|title=Nouveau message de Thomas Leroy|body=Message privé|image=$(avatar 'Thomas Leroy')"
  [mention_dm]="type=MENTION|title=Vous avez été mentionné|body=Julie Martin vous a mentionné|image=$(avatar 'Julie Martin')"
  [mention_thread]="type=MENTION|title=Vous avez été mentionné dans général|body=Thomas Leroy vous a mentionné|image=$(avatar 'Thomas Leroy')"
  [task]="type=TASK_ASSIGNED|title=Nouvelle tâche|body=Une tâche vous a été assignée : Préparer la démo client"
  [event]="type=EVENT_INVITE|title=Invitation à un événement|body=Vous avez été invité(e) à \"Point hebdo produit\""
  [reminder]="type=EVENT_REMINDER|title=Rappel d'événement|body=\"Point hebdo produit\" commence bientôt."
  [missed_call]="type=MISSED_CALL|title=Appel manqué|body=Julie Martin a essayé de vous appeler|image=$(avatar 'Julie Martin')"
  [call]="kind=call|callerId=preview-caller|callerName=Julie Martin"
  [meet]="kind=meet|callerId=preview-meet|callerName=Thomas Leroy"
  [call_end]="kind=call_end|callerId=preview-caller"
)
ORDER=(message_space message_dm mention_dm mention_thread task event reminder missed_call)

if [[ ${1:-} == list ]]; then printf '%s\n' "${ORDER[@]}" call meet call_end; exit 0; fi
names=("$@"); [[ ${#names[@]} -eq 0 ]] && names=("${ORDER[@]}")

# Le SDK Firebase n'affiche la notification lui-même que si l'app est en arrière-plan.
"$ADB" shell input keyevent KEYCODE_HOME

for name in "${names[@]}"; do
  spec=${S[$name]:-}; [[ -z $spec ]] && { echo "scénario inconnu : $name" >&2; exit 1; }
  args=""
  IFS='|' read -ra pairs <<< "$spec"
  for pair in "${pairs[@]}"; do
    value=${pair#*=}; value=${value//\'/\'\\\'\'}
    args+=" --es ${pair%%=*} '$value'"
  done
  "$ADB" shell "am broadcast -n $COMPONENT -a fr.silvercore.synco.DEBUG_PUSH$args" > /dev/null
  echo "→ $name"
  sleep 1
done
