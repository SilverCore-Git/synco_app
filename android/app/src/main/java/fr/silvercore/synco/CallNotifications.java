package fr.silvercore.synco;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Notification « appel entrant » (appel DM ou invitation à une session éphémère), affichée par
 * SyncoMessagingService à la réception d'un push d'appel de synco_api (callPushService.ts) quand l'app
 * n'est pas au premier plan : style appel (CallStyle), sonnerie du téléphone en boucle, plein écran si
 * l'écran est éteint, boutons Refuser / Répondre. Elle s'arrête seule au bout de RING_TIMEOUT_MS, ou sur
 * le push de fin d'appel (l'appelant a raccroché).
 *
 * Répondre ou toucher la notification ouvre l'app (MainActivity) avec l'action demandée, relayée au
 * front par CallNotifyPlugin. Refuser coupe seulement la sonnerie : sans session ouverte, rien ne peut
 * prévenir l'appelant, dont l'appel aboutit à « Appel manqué » à la fin de sa sonnerie.
 *
 * Pas de setShowWhenLocked sur MainActivity : sur un téléphone verrouillé, Répondre demande d'abord de
 * déverrouiller, plutôt que d'ouvrir toute l'app par-dessus l'écran de verrouillage.
 */
final class CallNotifications {

    static final String CHANNEL_ID = "synco_calls";
    static final String EXTRA_ACTION = "fr.silvercore.synco.CALL_ACTION";
    static final String EXTRA_KIND = "fr.silvercore.synco.CALL_KIND";
    static final String EXTRA_CALLER_ID = "fr.silvercore.synco.CALL_CALLER_ID";
    static final String ACTION_ANSWER = "answer";
    static final String ACTION_OPEN = "open";

    /** Légèrement au-delà des 30 s de sonnerie de l'appelant. */
    private static final long RING_TIMEOUT_MS = 35_000;
    /** Push reçu trop tard (réseau, Doze) : l'appel est déjà terminé, on ne fait pas sonner. */
    private static final long STALE_AFTER_MS = 30_000;

    /** Appels qui sonnent en ce moment (callerId → kind), pour MainActivity.onResume. */
    private static final Map<String, String> ringing = new LinkedHashMap<>();

    private CallNotifications() {}

    static synchronized void showIncoming(Context context, String kind, String callerId, String callerName, long sentAt) {
        if (sentAt > 0 && System.currentTimeMillis() - sentAt > STALE_AFTER_MS) return;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        ensureChannel(context);

        boolean meet = "meet".equals(kind);
        Person caller = new Person.Builder().setName(callerName).setImportant(true).build();

        PendingIntent open = activityIntent(context, ACTION_OPEN, kind, callerId);
        PendingIntent answer = activityIntent(context, ACTION_ANSWER, kind, callerId);
        Intent declineIntent = new Intent(context, CallActionReceiver.class)
            .putExtra(EXTRA_KIND, kind)
            .putExtra(EXTRA_CALLER_ID, callerId);
        PendingIntent decline = PendingIntent.getBroadcast(
            context, requestCode(callerId, "decline"), declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_synco)
            .setColor(ContextCompat.getColor(context, R.color.synco_notification))
            .setContentTitle(callerName)
            .setContentText(meet ? "Vous invite à une session éphémère" : "Appel entrant")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(RING_TIMEOUT_MS)
            .setContentIntent(open)
            // Obligatoire pour CallStyle hors service au premier plan. Sans la permission plein écran
            // (Android 14+ : réglage accordé par l'utilisateur), le système affiche un bandeau à la place.
            .setFullScreenIntent(open, true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer))
            .addPerson(caller);

        Notification notification = builder.build();
        // Sonnerie répétée jusqu'à la réponse, au refus ou à l'expiration, comme un vrai appel.
        notification.flags |= Notification.FLAG_INSISTENT;

        try {
            NotificationManagerCompat.from(context).notify(notificationId(callerId), notification);
            ringing.put(callerId, kind);
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS retirée entre-temps : rien à afficher.
        }
    }

    static synchronized void cancel(Context context, String callerId) {
        NotificationManagerCompat.from(context).cancel(notificationId(callerId));
        ringing.remove(callerId);
    }

    /** Retire toutes les sonneries en cours et rend celles qui sonnaient (callerId → kind). */
    static synchronized Map<String, String> cancelAll(Context context) {
        Map<String, String> was = new LinkedHashMap<>(ringing);
        for (String callerId : was.keySet()) {
            NotificationManagerCompat.from(context).cancel(notificationId(callerId));
        }
        ringing.clear();
        return was;
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Appels", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Appels et invitations à une session éphémère");
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        channel.setSound(ringtone, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 800, 600, 800, 600 });
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static PendingIntent activityIntent(Context context, String action, String kind, String callerId) {
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_KIND, kind)
            .putExtra(EXTRA_CALLER_ID, callerId);
        return PendingIntent.getActivity(
            context, requestCode(callerId, action), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int notificationId(String callerId) {
        return ("call:" + callerId).hashCode();
    }

    private static int requestCode(String callerId, String action) {
        return (callerId + ":" + action).hashCode();
    }
}
