import Keycloak from "keycloak-js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { saveRefreshToken, loadRefreshToken, clearTokens } from './secureTokenStore';
import { lockSecurity } from './utils/crypto';

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080/auth';
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'SilverTeams';
const KC_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'silverteams_web_app';

export const keycloak = new Keycloak({
  url: KC_URL,
  realm: KC_REALM,
  clientId: KC_CLIENT_ID,
});

// Migration (audit FC9) : les versions précédentes écrivaient kc_token/
// kc_refreshToken en clair dans localStorage sur Tauri/Capacitor. Purge
// unique et inconditionnelle au chargement du module — contrairement à
// clearTokens() (appelée à la déconnexion), celle-ci ne touche jamais le
// nouveau coffre sécurisé, seulement ces deux anciennes clés en clair.
try {
  localStorage.removeItem('kc_token');
  localStorage.removeItem('kc_refreshToken');
} catch { /* localStorage indisponible (SSR, navigation privée) */ }

function isTauriPlatform(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

const doTokenRefresh = (minValiditySeconds: number) => {
  keycloak.updateToken(minValiditySeconds)
    .then((refreshed) => {
      if (refreshed) {
        // Seul le refresh token est persisté, et uniquement dans le coffre
        // sécurisé de l'OS — le jeton d'accès ne vit plus qu'en mémoire
        // dans cette instance keycloak-js (audit FC9).
        if ((Capacitor.isNativePlatform() || isTauriPlatform()) && keycloak.refreshToken) {
          saveRefreshToken(keycloak.refreshToken).catch((err) => console.error('[Keycloak] Échec de la sauvegarde du refresh token', err));
        }
      }
    })
    .catch((err) => {
      console.error('[Keycloak] Échec du refresh du token', err);
    });
};

// Un seul intervalle pour toute la session (setupTokenRefresh() est rappelé
// après chaque flux d'auth — natif, web, Tauri...) — sans ce garde, chaque
// rappel en empilerait un de plus.
let proactiveRefreshInterval: ReturnType<typeof setInterval> | null = null;

const setupTokenRefresh = () => {
  // keycloak-js programme ce callback via un UNIQUE setTimeout calculé comme
  // (exp - now), sans aucune marge : il ne se déclenche donc qu'à l'instant
  // exact où le jeton expire, jamais avant. Le serveur socket.io revalide
  // chaque connexion toutes les 60s (ws.ts) et la coupe immédiatement si le
  // jeton y est déjà expiré à cet instant précis — sans marge de sécurité
  // côté client, le moindre aller-retour réseau pour le refresh (ou pire,
  // un onglet mis en arrière-plan : les navigateurs limitent fortement la
  // fréquence des setTimeout/setInterval dans cet état, retardant d'autant
  // ce setTimeout précis calculé à l'avance) fait perdre cette course et
  // coupe une connexion par ailleurs parfaitement saine. C'est très
  // probablement la cause des déconnexions "aléatoires" du socket.io
  // observées en prod : rien à voir avec la stabilité du réseau ou du
  // serveur, juste un jeton renouvelé une fraction de seconde trop tard.
  keycloak.onTokenExpired = () => doTokenRefresh(30);

  // Rafraîchissement proactif, avec une marge large (90s), vérifié toutes
  // les 20s — élimine la course ci-dessus au lieu de simplement réduire sa
  // fenêtre : même avec un onglet en arrière-plan (throttling navigateur
  // limitant au pire à ~1 vérification/minute), il reste une marge
  // confortable avant l'expiration réelle.
  if (!proactiveRefreshInterval) {
    proactiveRefreshInterval = setInterval(() => doTokenRefresh(90), 20000);
  }
};

const onTokenRefresh = (callback: () => void): (() => void) => {
  keycloak.onAuthRefreshSuccess = callback;
  return () => {
    if (keycloak.onAuthRefreshSuccess === callback) {
      keycloak.onAuthRefreshSuccess = undefined;
    }
  };
};

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

const LOGIN_FLOW_TIMEOUT_MS = 5 * 60 * 1000;

// `state` était généré puis envoyé à Keycloak, mais jamais revérifié sur le
// retour : un lien fr.silvercore.synco://callback?code=...&state=... arrivant
// d'ailleurs (notification, autre app, lien ouvert par l'utilisateur) était
// accepté dès lors qu'il contenait "code=", permettant d'injecter un code
// d'autorisation attaquant dans la session victime (CSRF OAuth) — audit FX9.
// L'app peut recevoir des deep links hors contexte de login (notifications)
// à tout moment : un lien qui ne correspond pas est ignoré, pas rejeté, pour
// laisser la vraie réponse de Keycloak arriver ensuite.
function extractValidatedCode(url: string, expectedState: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  if (!code || !state || state !== expectedState) return null;
  return code;
}

async function nativeLogin(): Promise<{ token?: string; refreshToken?: string }> {
  const redirectUri = 'fr.silvercore.synco://callback';
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  let resolveDeepLink!: (code: string | null) => void;
  const deepLinkArrived = new Promise<string | null>((resolve) => {
    resolveDeepLink = resolve;
  });

  const listenerHandle = await CapApp.addListener('appUrlOpen', async (data: URLOpenListenerEvent) => {
    const code = extractValidatedCode(data.url, state);
    if (code === null) return;
    await Browser.close().catch(() => {});
    resolveDeepLink(code);
  });

  const authUrl = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/auth`
    + `?client_id=${encodeURIComponent(KC_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&response_type=code&scope=openid&state=${state}`
    + `&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  await Browser.open({ url: authUrl });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOGIN_FLOW_TIMEOUT_MS));
  const code = await Promise.race([deepLinkArrived, timeout]);
  await listenerHandle.remove();
  if (!code) return {};

  const tokenRes = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KC_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    console.error('[Keycloak] Échange code échoué:', await tokenRes.text());
    return {};
  }
  const tokens = await tokenRes.json();
  return { token: tokens.access_token, refreshToken: tokens.refresh_token };
}

async function tauriLogin(): Promise<{ token?: string; refreshToken?: string }> {
  const redirectUri = 'fr.silvercore.synco://callback';
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  let resolveDeepLink!: (code: string | null) => void;
  const deepLinkArrived = new Promise<string | null>((resolve) => {
    resolveDeepLink = resolve;
  });

  const unlistenOpenUrl = await onOpenUrl((urls: string[]) => {
    const url = urls[0];
    const code = url ? extractValidatedCode(url, state) : null;
    if (code !== null) resolveDeepLink(code);
  });

  const unlistenSingleInstance = await listen('single-instance', (event: any) => {
    const args = event.payload as string[];
    const urlArg = args.find((a: string) => a.startsWith(redirectUri));
    const code = urlArg ? extractValidatedCode(urlArg, state) : null;
    if (code !== null) resolveDeepLink(code);
  });

  const authUrl = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/auth`
    + `?client_id=${encodeURIComponent(KC_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&response_type=code&scope=openid&state=${state}`
    + `&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  await invoke('open_external_url', { url: authUrl });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOGIN_FLOW_TIMEOUT_MS));
  const code = await Promise.race([deepLinkArrived, timeout]);
  unlistenSingleInstance();
  unlistenOpenUrl();
  if (!code) return {};

  // fetch natif — fonctionne car connect-src dans la CSP de tauri.conf.json autorise KC_URL
  const tokenRes = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KC_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    console.error('[Keycloak] Échange code Tauri échoué:', await tokenRes.text());
    return {};
  }
  const tokens = await tokenRes.json();
  return { token: tokens.access_token, refreshToken: tokens.refresh_token };
}

// keycloak-js#init() ne fait quoi que ce soit que si `token` ET
// `refreshToken` sont tous deux fournis (sinon la branche entière est
// sautée, authenticated reste faux) — passer seulement un refreshToken ne
// suffit donc pas à restaurer une session. On échange nous-mêmes le refresh
// token contre un jeton d'accès frais, comme tauriLogin()/nativeLogin() le
// font déjà pour le code d'autorisation (audit FC9 : seul le refresh token
// est désormais relu depuis le stockage persistant, jamais le jeton d'accès).
async function exchangeRefreshToken(refreshToken: string): Promise<{ token?: string; refreshToken?: string }> {
  try {
    const tokenRes = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: KC_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });
    if (!tokenRes.ok) return {};
    const tokens = await tokenRes.json();
    return { token: tokens.access_token, refreshToken: tokens.refresh_token };
  } catch (error) {
    console.error('[Keycloak] Échec du renouvellement du refresh token', error);
    return {};
  }
}

/**
 * Ouvre le navigateur système pour se connecter à Keycloak, puis termine
 * l'initialisation du client keycloak-js avec les tokens obtenus.
 * Doit être déclenché depuis une interaction utilisateur (clic bouton) —
 * on ne veut pas ouvrir un onglet de navigateur sans action explicite.
 */
async function loginWithSystemBrowser(): Promise<boolean> {
  try {
    const redirectUri = 'fr.silvercore.synco://callback';
    const fresh = await tauriLogin();
    if (!fresh.token) return false;

    const authenticated = await keycloak.init({
      checkLoginIframe: false,
      redirectUri,
      responseMode: 'query',
      token: fresh.token,
      refreshToken: fresh.refreshToken,
    });

    if (authenticated) {
      if (keycloak.refreshToken) await saveRefreshToken(keycloak.refreshToken);
      const userInfo: any = await keycloak.loadUserInfo();
      localStorage.setItem('userId', userInfo.sub);
      setupTokenRefresh();
    }
    return authenticated;
  } catch (error) {
    console.error("[Keycloak] Échec de la connexion via le navigateur système", error);
    return false;
  }
}

// Clés propres à l'utilisateur : tout ce qui révèle son activité ou permet
// de reprendre sa session. Les préférences purement visuelles (thème...)
// peuvent rester pour la prochaine personne sur ce poste.
const USER_SCOPED_PREFIXES = ['kc_', 'lastRead_', 'agenda-hidden-', 'task-filters'];
const USER_SCOPED_KEYS = ['userId', 'lastOpenedOrgId', 'fcm-device-id'];

/**
 * Déconnexion complète : révoque la session côté Keycloak SANS afficher le
 * moindre écran Keycloak (POST back-channel avec le refresh token — règle
 * projet « zéro parcours Keycloak visible »), puis purge tout le stockage
 * local qui permettrait de reprendre la session.
 *
 * `keycloak.logout()` seul laissait kc_token/kc_refreshToken en clair dans
 * localStorage sur Tauri/Capacitor (et depuis FC9, aurait laissé le refresh
 * token dans le coffre sécurisé) : la session suivante sur le même poste la
 * reprenait silencieusement (audit FX3).
 */
async function logoutEverywhere(): Promise<void> {
  const refreshToken = keycloak.refreshToken ?? (await loadRefreshToken().catch(() => undefined));
  if (refreshToken) {
    await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: KC_CLIENT_ID, refresh_token: refreshToken }),
    }).catch(() => {});
  }

  await clearTokens();

  try {
    for (const key of Object.keys(localStorage)) {
      if (USER_SCOPED_KEYS.includes(key) || USER_SCOPED_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* localStorage indisponible */ }

  try { sessionStorage.clear(); } catch { /* indisponible */ }

  // idb-keyval porte l'épinglage TOFU des clés publiques des correspondants
  // (keyTrust.ts) : le purger impose une nouvelle vérification au prochain
  // login, ce qui est le comportement attendu sur un appareil partagé.
  try {
    const { clear } = await import('idb-keyval');
    await clear();
  } catch { /* idb-keyval indisponible ou vide */ }

  // Vide aussi la clé privée et tous les caches de clés de salon/espace/DM/
  // session IA en mémoire (audit FC10) — sans ça, une session restaurée par
  // erreur sur ce même onglet retrouverait des clés déjà déverrouillées.
  lockSecurity();

  keycloak.clearToken();
  window.location.replace('/');
}

const initKC = async () => {
  try {
    if (isTauriPlatform()) {
      const redirectUri = 'fr.silvercore.synco://callback';
      // Plus de jeton d'accès persisté : seul le refresh token est relu
      // depuis le coffre sécurisé (keyring, via secure_store_get), puis
      // échangé contre un jeton d'accès frais avant d'initialiser
      // keycloak-js avec les deux (audit FC9).
      const cachedRefreshToken = await loadRefreshToken();
      if (!cachedRefreshToken) {
        // Pas de session valide en cache : on laisse l'UI proposer à
        // l'utilisateur de se connecter (bouton -> loginWithSystemBrowser),
        // plutôt que d'ouvrir un onglet de navigateur sans action de sa part.
        return false;
      }

      const fresh = await exchangeRefreshToken(cachedRefreshToken);
      if (!fresh.token || !fresh.refreshToken) {
        // Refresh token expiré/révoqué côté Keycloak (session SSO terminée) :
        // on purge le coffre plutôt que de laisser une valeur morte dessus.
        await clearTokens();
        return false;
      }

      const authenticated = await keycloak.init({
        checkLoginIframe: false,
        redirectUri,
        responseMode: 'query',
        token: fresh.token,
        refreshToken: fresh.refreshToken,
      });

      if (authenticated) {
        if (keycloak.refreshToken) await saveRefreshToken(keycloak.refreshToken);
        const userInfo: any = await keycloak.loadUserInfo();
        localStorage.setItem('userId', userInfo.sub);
        setupTokenRefresh();
      }
      return authenticated;
    }

    if (Capacitor.isNativePlatform()) {
      const redirectUri = 'fr.silvercore.synco://callback';
      // Plus de jeton d'accès persisté (audit FC9) : on tente d'abord un
      // échange silencieux du refresh token gardé dans le Keychain/Android
      // Keystore, et on ne retombe sur l'ouverture interactive du navigateur
      // (nativeLogin) que si aucun refresh token n'est disponible ou qu'il a
      // été révoqué/a expiré côté Keycloak.
      const cachedRefreshToken = await loadRefreshToken();
      let token: string | undefined;
      let refreshToken: string | undefined;
      if (cachedRefreshToken) {
        const fresh = await exchangeRefreshToken(cachedRefreshToken);
        token = fresh.token;
        refreshToken = fresh.refreshToken;
        if (!token) await clearTokens();
      }

      if (!token) {
        const fresh = await nativeLogin();
        token = fresh.token;
        refreshToken = fresh.refreshToken;
      }

      const authenticated = await keycloak.init({
        checkLoginIframe: false,
        redirectUri,
        responseMode: 'query',
        token,
        refreshToken,
      });

      if (authenticated) {
        if (keycloak.refreshToken) await saveRefreshToken(keycloak.refreshToken);
        const userInfo: any = await keycloak.loadUserInfo();
        localStorage.setItem('userId', userInfo.sub);
        setupTokenRefresh();
      }
      return authenticated;
    }

    // --- web ---
    const authenticated = await keycloak.init({
      onLoad: 'login-required',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });

    if (authenticated) {
      const userInfo: any = await keycloak.loadUserInfo();
      window.localStorage.setItem('userId', userInfo.sub);
      setupTokenRefresh();
    }
    return authenticated;
  } catch (error) {
    console.error("[Keycloak] Erreur d'initialisation Keycloak", error);
    return false;
  }
};

export { initKC, setupTokenRefresh, onTokenRefresh, isTauriPlatform, loginWithSystemBrowser, logoutEverywhere };