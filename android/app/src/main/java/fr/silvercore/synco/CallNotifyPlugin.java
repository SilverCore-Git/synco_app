package fr.silvercore.synco;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Relaie au front (src/assets/nativeCalls.ts) ce que l'utilisateur a fait de la notification d'appel :
 * « answer » (Répondre) ou « open » (toucher la notification, ou ouvrir l'app pendant qu'elle sonne).
 *
 * L'action peut arriver avant que la WebView soit prête (app lancée par la notification) : elle est
 * gardée jusqu'à consumePendingAction(), et sinon émise en évènement `callAction`.
 */
@CapacitorPlugin(name = "CallNotify")
public class CallNotifyPlugin extends Plugin {

    private static CallNotifyPlugin instance;
    private static JSObject pending;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        synchronized (CallNotifyPlugin.class) {
            JSObject result = pending != null ? pending : new JSObject();
            pending = null;
            call.resolve(result);
        }
    }

    /** Intent de MainActivity (création ou onNewIntent) : action de notification éventuelle. */
    static void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(CallNotifications.EXTRA_ACTION);
        String kind = intent.getStringExtra(CallNotifications.EXTRA_KIND);
        String callerId = intent.getStringExtra(CallNotifications.EXTRA_CALLER_ID);
        // Consommé une fois : une recréation de l'activité ne doit pas rejouer la réponse.
        intent.removeExtra(CallNotifications.EXTRA_ACTION);
        if (action == null || kind == null || callerId == null) return;
        deliver(action, kind, callerId);
    }

    static void deliver(String action, String kind, String callerId) {
        JSObject event = new JSObject();
        event.put("action", action);
        event.put("kind", kind);
        event.put("callerId", callerId);
        synchronized (CallNotifyPlugin.class) {
            if (instance != null && instance.hasListeners("callAction")) {
                instance.notifyListeners("callAction", event);
            } else {
                pending = event;
            }
        }
    }
}
