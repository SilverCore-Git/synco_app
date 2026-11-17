package fr.silvercore.synco;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Notifications push « classiques » (messages, mentions, tâches, agenda, appels manqués…) dessinées par
 * l'app, au lieu du rendu par défaut du SDK Firebase. synco_api envoie ce format (données seules, clés
 * `n.*`, voir fcmService.nativeAndroidMessage) aux appareils qui l'annoncent (deviceInfo.pushFormat,
 * nativePush.ts).
 *
 *  - Photo de l'expéditeur en rond à gauche, qui reste à cette taille quand on déroule la notification
 *    (le SDK Firebase la passait en grande image BigPicture). Sans photo : ses initiales.
 *  - Messages et mentions : boutons « Marquer comme lu » (sans ouvrir l'app, PushActionReceiver) et
 *    « Ouvrir ». Une seule notification par conversation : un nouveau message remplace le précédent.
 *  - Toucher la notification ouvre l'app avec les mêmes extras qu'une notification Firebase
 *    (google.message_id + données) : le plugin push-notifications relaie le tap à nativePush.ts.
 */
final class SyncoNotifications {

    private static final String TAG = "SyncoNotifications";
    static final String CHANNEL_ID = "synco";
    static final String EXTRA_READ_URL = "fr.silvercore.synco.READ_URL";
    static final String EXTRA_TAG = "fr.silvercore.synco.NOTIFICATION_TAG";
    static final int NOTIFICATION_ID = 1;

    private static final String KEY_PREFIX = "n.";
    private static final int AVATAR_PX = 192;
    private static final int AVATAR_TIMEOUT_MS = 5_000;
    private static final int AVATAR_MAX_BYTES = 2 * 1024 * 1024;
    /** Fond des initiales, comme le repli ui-avatars des clients (background=128a60). */
    private static final int INITIALS_BACKGROUND = 0xFF128A60;

    private SyncoNotifications() {}

    /** Push au format natif de synco_api ? */
    static boolean isNativePush(Map<String, String> data) {
        return data.containsKey(KEY_PREFIX + "title");
    }

    static void show(Context context, String messageId, Map<String, String> data) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        ensureChannel(context);

        String title = valueOr(data.get("n.title"), "Synco");
        String body = valueOr(data.get("n.body"), "");
        String sender = data.get("n.sender");
        String readUrl = data.get("n.read");
        String type = valueOr(data.get("type"), "");
        boolean conversation = "MESSAGE".equals(type) || "MENTION".equals(type);
        // Une notification par conversation (remplacée au message suivant), sinon une par notification.
        String tag = valueOr(data.get("n.conversation"), valueOr(data.get("notificationId"), messageId));

        PendingIntent open = openIntent(context, tag, messageId, data);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_synco)
            .setColor(ContextCompat.getColor(context, R.color.synco_notification))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(conversation ? NotificationCompat.CATEGORY_MESSAGE : categoryFor(type))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setSilent("none".equals(data.get("n.sound")));

        Bitmap avatar = avatar(data.get("n.avatar"), sender);
        if (avatar != null) builder.setLargeIcon(avatar);

        if (conversation) {
            if (readUrl != null && !readUrl.isEmpty()) {
                builder.addAction(0, "Marquer comme lu", readIntent(context, tag, readUrl));
            }
            builder.addAction(0, "Ouvrir", open);
        }

        try {
            NotificationManagerCompat.from(context).notify(tag, NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS retirée entre-temps : rien à afficher.
        }
    }

    static void cancel(Context context, String tag) {
        NotificationManagerCompat.from(context).cancel(tag, NOTIFICATION_ID);
    }

    private static String categoryFor(String type) {
        switch (type) {
            case "MISSED_CALL":
            case "MISSED_MEET":
                return NotificationCompat.CATEGORY_MISSED_CALL;
            case "EVENT_INVITE":
            case "EVENT_REMINDER":
            case "EVENT_RSVP":
                return NotificationCompat.CATEGORY_EVENT;
            case "TASK_ASSIGNED":
                return NotificationCompat.CATEGORY_REMINDER;
            default:
                return NotificationCompat.CATEGORY_SOCIAL;
        }
    }

    /** Canal tel que nativePush.ts le crée, au cas où l'app n'aurait pas encore tourné depuis l'installation. */
    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Synco", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Messages, mentions, appels et rappels");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    /** Même forme qu'une notification Firebase touchée : le plugin push-notifications la relaie au front. */
    private static PendingIntent openIntent(Context context, String tag, String messageId, Map<String, String> data) {
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("google.message_id", messageId);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            if (!entry.getKey().startsWith(KEY_PREFIX)) intent.putExtra(entry.getKey(), entry.getValue());
        }
        return PendingIntent.getActivity(context, ("open:" + tag).hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent readIntent(Context context, String tag, String readUrl) {
        Intent intent = new Intent(context, PushActionReceiver.class)
            .putExtra(EXTRA_READ_URL, readUrl)
            .putExtra(EXTRA_TAG, tag);
        return PendingIntent.getBroadcast(context, ("read:" + tag).hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---- Avatar ----

    /** Photo de l'expéditeur en rond, sinon ses initiales, sinon rien (tâches, agenda…). */
    private static Bitmap avatar(String url, String name) {
        Bitmap photo = download(url);
        if (photo != null) return circle(photo);
        if (name != null && !name.trim().isEmpty()) return initials(name);
        return null;
    }

    /** Appelé hors du thread principal (FirebaseMessagingService) : le téléchargement peut bloquer. */
    private static Bitmap download(String url) {
        if (url == null || url.isEmpty()) return null;
        // HTTPS seulement, plus la boucle locale (serveur d'aperçu de push-preview.sh via adb reverse,
        // déjà autorisée en clair par network_security_config.xml).
        if (!url.startsWith("https://") && !url.startsWith("http://localhost:")) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(AVATAR_TIMEOUT_MS);
            connection.setReadTimeout(AVATAR_TIMEOUT_MS);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[16 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    if (out.size() > AVATAR_MAX_BYTES) return null;
                }
                byte[] bytes = out.toByteArray();
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
        } catch (Exception e) {
            Log.w(TAG, "avatar indisponible", e);
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static Bitmap circle(Bitmap source) {
        int side = Math.min(source.getWidth(), source.getHeight());
        Bitmap square = Bitmap.createBitmap(source, (source.getWidth() - side) / 2, (source.getHeight() - side) / 2, side, side);
        Bitmap scaled = Bitmap.createScaledBitmap(square, AVATAR_PX, AVATAR_PX, true);
        Bitmap out = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(out).drawCircle(AVATAR_PX / 2f, AVATAR_PX / 2f, AVATAR_PX / 2f, paint);
        return out;
    }

    private static Bitmap initials(String name) {
        StringBuilder letters = new StringBuilder();
        for (String part : name.trim().split("\\s+")) {
            if (!part.isEmpty() && letters.length() < 2) letters.appendCodePoint(Character.toUpperCase(part.codePointAt(0)));
        }
        Bitmap out = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setColor(INITIALS_BACKGROUND);
        canvas.drawCircle(AVATAR_PX / 2f, AVATAR_PX / 2f, AVATAR_PX / 2f, background);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(Color.WHITE);
        text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        text.setTextSize(AVATAR_PX * 0.38f);
        text.setTextAlign(Paint.Align.CENTER);
        Rect bounds = new Rect();
        String label = letters.toString();
        text.getTextBounds(label, 0, label.length(), bounds);
        canvas.drawText(label, AVATAR_PX / 2f, AVATAR_PX / 2f - bounds.exactCenterY(), text);
        return out;
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
