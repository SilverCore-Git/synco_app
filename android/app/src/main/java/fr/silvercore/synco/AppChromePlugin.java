package fr.silvercore.synco;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Barres système (barre d'état en haut, barre de navigation en bas) aux couleurs de l'app, thème clair ou sombre :
 * même idée que la barre de titre de l'app Tauri, qui reprend le fond de l'app.
 *
 * Depuis Android 15, l'app est dessinée bord à bord : les barres sont transparentes et laissent voir ce qui est
 * derrière la WebView, que Capacitor décale de la hauteur des barres. On colore donc ce fond (la vue parente de
 * la WebView et la fenêtre) ; avant Android 15, la couleur des barres elles-mêmes. Les icônes passent en clair
 * sur fond sombre, en sombre sur fond clair.
 *
 * Appelé depuis src/assets/nativeSystemBars.ts à chaque changement de thème.
 */
@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {

    @PluginMethod
    public void setColors(PluginCall call) {
        String colorString = call.getString("color");
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));

        final int color;
        try {
            color = Color.parseColor(colorString == null ? "" : colorString);
        } catch (IllegalArgumentException e) {
            call.reject("Couleur invalide : " + colorString);
            return;
        }

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(color);

            View webViewParent = (View) getBridge().getWebView().getParent();
            if (webViewParent != null) webViewParent.setBackgroundColor(color);

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
            }
            // Navigation à trois boutons : Android y pose sinon un voile translucide qui fausse la couleur.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setNavigationBarContrastEnforced(false);
                window.setStatusBarContrastEnforced(false);
            }

            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);

            call.resolve();
        });
    }
}
