import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.silvercore.synco',
  appName: 'synco',
  webDir: 'dist',
  plugins: {
    // Le patch global de fetch/XMLHttpRequest fait sortir les requêtes du
    // moteur web vers la pile HTTP native (Java/Swift) : la CSP connect-src
    // (index.html) ne s'applique alors plus sur Android/iOS, pas plus que le
    // contrôle CORS — la liste d'origines qu'elle maintient n'était
    // qu'apparente sur mobile. C'est aussi ce qui laisse FC5 pleinement
    // exploitable sur Capacitor même une fois la passerelle IA validée côté
    // JS (audit FX4). Si cette activation globale répondait à un vrai
    // problème CORS/cookies, la correction doit avoir lieu côté synco_api
    // (en-têtes CORS pour l'origine Capacitor), pas en recontournant le
    // moteur web.
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
