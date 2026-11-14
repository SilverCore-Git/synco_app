package fr.silvercore.synco;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Indique si Firebase est configuré dans ce build, c'est-à-dire si google-services.json était présent :
 * le plugin Gradle google-services génère alors la ressource google_app_id, la même que lit Firebase
 * pour s'initialiser au démarrage.
 *
 * Sans elle, PushNotifications.register() lève une IllegalStateException que le pont Capacitor relance
 * et l'app plante. nativePush.ts interroge donc ce plugin avant tout enregistrement (build local ou CI
 * sans le secret GOOGLE_SERVICES_JSON : l'app fonctionne, sans push).
 */
@CapacitorPlugin(name = "PushSupport")
public class PushSupportPlugin extends Plugin {

    @PluginMethod
    public void isConfigured(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("configured", id != 0);
        call.resolve(result);
    }
}
