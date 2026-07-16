import Keycloak from "keycloak-js";
import { kcToken } from "./var";

const keycloak = new Keycloak({
  url: (import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080/auth'),
  realm: (import.meta.env.VITE_KEYCLOAK_REALM || 'SilverTeams'),
  clientId: (import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'silverteams_web_app'),
});

let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
const tokenListeners: Array<() => void> = [];

const isDev = import.meta.env.VITE_DEV === 'true';

const setupTokenRefresh = () => {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
  }
  
  tokenRefreshInterval = setInterval(async () => {
    try {
      const refreshed = await keycloak.updateToken(30);
      if (refreshed) {
        if (isDev) console.log('[Keycloak] Token rafraîchi avec succès');
        kcToken.value = keycloak.token || '';
        notifyTokenRefreshed();
      }
    } catch (error) {
      console.error('[Keycloak] Erreur lors du rafraîchissement du token, redirection login:', error);
      keycloak.login();
    }
  }, 30000);
};

const notifyTokenRefreshed = () => {
  tokenListeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.error('[Keycloak] Error in token refresh listener:', error);
    }
  });
};

const onTokenRefresh = (callback: () => void) => {
  tokenListeners.push(callback);
  return () => {
    const index = tokenListeners.indexOf(callback);
    if (index !== -1) {
      tokenListeners.splice(index, 1);
    }
  };
};

const initKC = async () => {

  try {

    await keycloak.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });

    if (keycloak.authenticated) {
      await keycloak.loadUserInfo();
      kcToken.value = keycloak.token || '';

      setupTokenRefresh();

    }

  } catch (error) {
    console.error("[Keycloak] Erreur d'initialisation Keycloak", error);
  }

};

export { initKC, setupTokenRefresh, onTokenRefresh };
export default keycloak;