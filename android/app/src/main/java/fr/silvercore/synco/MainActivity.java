package fr.silvercore.synco;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import java.util.Map;

public class MainActivity extends BridgeActivity {

    /** Lu par SyncoMessagingService : app visible, l'appel entrant passe par le WebSocket, pas par une notification. */
    private static volatile boolean inForeground = false;

    static boolean isInForeground() {
        return inForeground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locaux : à enregistrer avant super.onCreate, qui crée le pont avec la WebView.
        registerPlugin(AppChromePlugin.class);
        registerPlugin(PushSupportPlugin.class);
        registerPlugin(CallNotifyPlugin.class);
        super.onCreate(savedInstanceState);
        handleCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleCallIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        inForeground = true;
        // L'app revient au premier plan pendant qu'un appel sonne (ouverte à la main, ou déverrouillage) :
        // la sonnerie native s'arrête et l'app prend le relais (carte d'appel entrant).
        for (Map.Entry<String, String> call : CallNotifications.cancelAll(this).entrySet()) {
            CallNotifyPlugin.deliver(CallNotifications.ACTION_OPEN, call.getValue(), call.getKey());
        }
    }

    @Override
    public void onPause() {
        inForeground = false;
        super.onPause();
    }

    /** Répondre / toucher la notification d'appel : coupe la sonnerie et relaie l'action au front. */
    private void handleCallIntent(Intent intent) {
        String callerId = intent == null ? null : intent.getStringExtra(CallNotifications.EXTRA_CALLER_ID);
        if (callerId != null) CallNotifications.cancel(this, callerId);
        CallNotifyPlugin.handleIntent(intent);
    }
}
