import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "https://auth.silvercore.fr",
  realm: "SilverTeams",
  clientId: "silverteams_web_app",
});

const initKC = async () => {

  window.localStorage.setItem('userId', (await keycloak.loadUserInfo()).sub);

}

export { initKC };
export default keycloak;