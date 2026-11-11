package fr.silvercore.synco;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locaux : à enregistrer avant super.onCreate, qui crée le pont avec la WebView.
        registerPlugin(AppChromePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
