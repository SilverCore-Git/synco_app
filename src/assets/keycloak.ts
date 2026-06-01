import Keycloak from "keycloak-js";
import isDesktopApp from "./isDesktopApp";
import localStore from "./localStore";

const keycloak = new Keycloak({
  url: (import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080/auth'),
  realm: (import.meta.env.VITE_KEYCLOAK_REALM || 'SilverTeams'),
  clientId: (import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'silverteams_web_app'),
});


const initKC = async () => {

  try {
    const isDesktop = isDesktopApp();

    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      // Only use silentCheckSsoRedirectUri in web mode
      ...(isDesktop ? {} : { silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html' }),
      pkceMethod: 'S256',
    });

    if (authenticated)
    {

      const userInfo: any = await keycloak.loadUserInfo();

      // Use localStore abstraction instead of localStorage
      await localStore.set('userId', userInfo.sub);

      setInterval(async () => {
        try {
          const refreshed = await keycloak.updateToken(70);
          if (refreshed) {
            console.log('Token rafraîchi avec succès');
          }
        } catch (error) {
          console.error('Erreur lors du rafraîchissement du token ou session expirée');
        }
      }, 60000);

    }

  } catch (error) {
    console.error("Erreur d'initialisation Keycloak", error);
  }

};

export { initKC };
export default keycloak;