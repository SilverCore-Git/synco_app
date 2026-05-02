import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: (import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080/auth'),
  realm: (import.meta.env.VITE_KEYCLOAK_REALM || 'SilverTeams'),
  clientId: (import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'silverteams_web_app'),
});

const initKC = async () => {

  window.localStorage.setItem('userId', (await keycloak.loadUserInfo()).sub);

}

export { initKC };
export default keycloak;