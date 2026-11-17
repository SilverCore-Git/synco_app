package fr.silvercore.synco;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

import java.util.UUID;

/**
 * Build « preview » uniquement (fr.silvercore.synco.preview, installé à côté de l'app de production) : simule la réception d'un push FCM, pour voir le rendu des notifications
 * sans serveur ni identifiants Firebase.
 *
 * Le faux push suit le même chemin qu'un vrai : intent RECEIVE au format du SDK Firebase
 * (clés gcm.notification.*), traité par SyncoMessagingService. Une notification « message » est donc
 * affichée par le SDK Firebase lui-même (app en arrière-plan), un push d'appel par CallNotifications.
 *
 *   adb shell am broadcast -n fr.silvercore.synco.preview/fr.silvercore.synco.PushPreviewReceiver -a fr.silvercore.synco.DEBUG_PUSH \
 *     --es title "Nouveau message de Julie" --es body "Message privé" --es image "https://…" --es type MESSAGE
 *   adb shell am broadcast -n fr.silvercore.synco.preview/fr.silvercore.synco.PushPreviewReceiver -a fr.silvercore.synco.DEBUG_PUSH \
 *     --es kind call --es callerId test --es callerName "Julie Martin"
 *
 * Toute autre extra --es est transmise telle quelle dans les données du push.
 */
public class PushPreviewReceiver extends BroadcastReceiver {

    private static final String[] NOTIFICATION_KEYS = { "title", "body", "image" };

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle in = intent.getExtras() == null ? new Bundle() : intent.getExtras();
        Bundle extras = new Bundle();
        extras.putString("google.message_id", "preview-" + UUID.randomUUID());
        extras.putString("from", "preview");

        String kind = in.getString("kind");
        boolean call = kind != null && !kind.isEmpty();
        if (call && !in.containsKey("sentAt")) extras.putString("sentAt", String.valueOf(System.currentTimeMillis()));

        if (!call) {
            // Payload `notification` + android.notification de fcmService.ts (synco_api).
            extras.putString("gcm.n.e", "1");
            extras.putString("gcm.notification.android_channel_id", "synco");
            extras.putString("gcm.notification.sound2", "default");
            for (String key : NOTIFICATION_KEYS) {
                String value = in.getString(key);
                if (value != null && !value.isEmpty()) extras.putString("gcm.notification." + key, value);
            }
        }
        for (String key : in.keySet()) {
            if (call || !isNotificationKey(key)) {
                Object value = in.get(key);
                if (value != null) extras.putString(key, String.valueOf(value));
            }
        }

        ensureSyncoChannel(context);

        Intent receive = new Intent("com.google.android.c2dm.intent.RECEIVE").putExtras(extras);
        PendingResult pending = goAsync();
        Context app = context.getApplicationContext();
        // Sans google-services.json en local, aucune FirebaseApp : une factice suffit, rien ne part sur le réseau.
        if (FirebaseApp.getApps(app).isEmpty()) {
            FirebaseApp.initializeApp(app, new FirebaseOptions.Builder()
                .setApplicationId("1:000000000000:android:0000000000000000")
                .setProjectId("synco-preview")
                .setApiKey("preview")
                .build());
        }
        // Hors du thread principal : le SDK télécharge l'image de la notification de façon bloquante.
        new Thread(() -> {
            try {
                new Service(app).handleIntent(receive);
            } finally {
                pending.finish();
            }
        }, "push-preview").start();
    }

    /**
     * Canal « synco » tel que nativePush.ts le crée (PushNotifications.createChannel) : sans compte ni FCM,
     * l'app preview ne passe jamais par là, et le SDK retomberait sur son canal « Divers » par défaut.
     */
    private static void ensureSyncoChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel("synco") != null) return;
        NotificationChannel channel = new NotificationChannel("synco", "Synco", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Messages, mentions, appels et rappels");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private static boolean isNotificationKey(String key) {
        for (String k : NOTIFICATION_KEYS) if (k.equals(key)) return true;
        return false;
    }

    /** SyncoMessagingService rattaché au contexte de l'app, sans démarrer de service système. */
    private static final class Service extends SyncoMessagingService {
        Service(Context base) {
            attachBaseContext(base);
        }
    }
}
