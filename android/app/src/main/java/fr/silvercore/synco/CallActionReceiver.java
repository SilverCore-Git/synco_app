package fr.silvercore.synco;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Bouton « Refuser » de la notification d'appel : coupe la sonnerie sans ouvrir l'app. */
public class CallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String callerId = intent.getStringExtra(CallNotifications.EXTRA_CALLER_ID);
        if (callerId != null) CallNotifications.cancel(context, callerId);
    }
}
