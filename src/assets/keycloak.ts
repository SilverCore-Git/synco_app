import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "https://auth.silvercore.fr",
  realm: "SilverTeams",
  clientId: "silverteams_web_app",
});

export default keycloak;