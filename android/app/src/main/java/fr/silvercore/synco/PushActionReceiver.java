package fr.silvercore.synco;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Bouton « Marquer comme lu » d'une notification de message (SyncoNotifications) : retire la notification
 * tout de suite, puis appelle l'URL signée fournie par synco_api (POST /api/push/read/…, ticket HMAC,
 * sans session) qui marque la conversation comme lue. Échec réseau : la notification reste lue côté
 * téléphone, l'app la verra encore non lue à sa prochaine ouverture.
 */
public class PushActionReceiver extends BroadcastReceiver {

    private static final String TAG = "PushActionReceiver";
    private static final int TIMEOUT_MS = 10_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String tag = intent.getStringExtra(SyncoNotifications.EXTRA_TAG);
        String url = intent.getStringExtra(SyncoNotifications.EXTRA_READ_URL);
        if (tag != null) SyncoNotifications.cancel(context, tag);
        if (url == null || url.isEmpty()) return;

        PendingResult pending = goAsync();
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(TIMEOUT_MS);
                connection.setReadTimeout(TIMEOUT_MS);
                connection.setFixedLengthStreamingMode(0);
                connection.setDoOutput(true);
                int status = connection.getResponseCode();
                if (status >= 300) Log.w(TAG, "marquer comme lu refusé : " + status);
            } catch (Exception e) {
                Log.w(TAG, "marquer comme lu impossible", e);
            } finally {
                if (connection != null) connection.disconnect();
                pending.finish();
            }
        }, "push-read").start();
    }
}
