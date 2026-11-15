package fr.silvercore.synco;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Remplace le service FCM du plugin @capacitor/push-notifications (retiré dans AndroidManifest.xml) :
 * les pushs « appel » de synco_api (callPushService.ts, données seules, champ `kind`) deviennent une
 * notification d'appel native ; tout le reste suit le chemin normal du plugin.
 */
public class SyncoMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String kind = data.get("kind");
        String callerId = data.get("callerId");

        if (callerId != null && ("call".equals(kind) || "meet".equals(kind))) {
            // App au premier plan : le WebSocket a déjà fait sonner l'app (carte d'appel entrant).
            if (!MainActivity.isInForeground()) {
                CallNotifications.showIncoming(this, kind, callerId, valueOr(data.get("callerName"), "Quelqu'un"), parseLong(data.get("sentAt")));
            }
            return;
        }
        if (callerId != null && ("call_end".equals(kind) || "meet_end".equals(kind))) {
            CallNotifications.cancel(this, callerId);
            return;
        }

        super.onMessageReceived(remoteMessage);
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static long parseLong(String value) {
        try {
            return value == null ? 0 : Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
