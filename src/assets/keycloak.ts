import Keycloak from "keycloak-js";
import { kcToken } from "./var";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080/auth';
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'SilverTeams';
const KC_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'silverteams_web_app';

export const keycloak = new Keycloak({
  url: KC_URL,
  realm: KC_REALM,
  clientId: KC_CLIENT_ID,
});

function isTauriPlatform(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

const doTokenRefresh = (minValiditySeconds: number) => {
  keycloak.updateToken(minValiditySeconds)
    .then((refreshed) => {
      if (refreshed) {
        kcToken.value = keycloak.token || '';
        if (Capacitor.isNativePlatform() || isTauriPlatform()) {
          if (keycloak.token) localStorage.setItem('kc_token', keycloak.token);
          if (keycloak.refreshToken) localStorage.setItem('kc_refreshToken', keycloak.refreshToken);
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

async function nativeLogin(): Promise<{ token?: string; refreshToken?: string }> {
  const redirectUri = 'fr.silvercore.synco://callback';
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  let resolveDeepLink!: (url: string) => void;
  const deepLinkArrived = new Promise<string>((resolve) => {
    resolveDeepLink = resolve;
  });

  const listenerHandle = await CapApp.addListener('appUrlOpen', async (data: URLOpenListenerEvent) => {
    if (data.url.includes('code=')) {
      await Browser.close().catch(() => {});
      resolveDeepLink(data.url);
    }
  });

  const authUrl = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/auth`
    + `?client_id=${encodeURIComponent(KC_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&response_type=code&scope=openid&state=${state}`
    + `&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  await Browser.open({ url: authUrl });
  const callbackUrl = await deepLinkArrived;
  await listenerHandle.remove();

  const code = new URL(callbackUrl).searchParams.get('code');
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

  let resolveDeepLink!: (url: string) => void;
  const deepLinkArrived = new Promise<string>((resolve) => {
    resolveDeepLink = resolve;
  });

  onOpenUrl((urls: string[]) => {
    const url = urls[0];
    if (url && url.includes('code=')) resolveDeepLink(url);
  });

  const unlistenSingleInstance = await listen('single-instance', (event: any) => {
    const args = event.payload as string[];
    const urlArg = args.find((a: string) => a.startsWith(redirectUri));
    if (urlArg) resolveDeepLink(urlArg);
  });

  const authUrl = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/auth`
    + `?client_id=${encodeURIComponent(KC_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&response_type=code&scope=openid&state=${state}`
    + `&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  await invoke('open_external_url', { url: authUrl });
  const callbackUrl = await deepLinkArrived;
  unlistenSingleInstance();

  const code = new URL(callbackUrl).searchParams.get('code');
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

function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    const payloadPart = parts[1];
    if (!payloadPart) return true;
    const payload = JSON.parse(atob(payloadPart));
    return payload.exp * 1000 < Date.now() + 10000;
  } catch {
    return true;
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
      if (keycloak.token) localStorage.setItem('kc_token', keycloak.token);
      if (keycloak.refreshToken) localStorage.setItem('kc_refreshToken', keycloak.refreshToken);
      const userInfo: any = await keycloak.loadUserInfo();
      localStorage.setItem('userId', userInfo.sub);
      kcToken.value = keycloak.token || '';
      setupTokenRefresh();
    }
    return authenticated;
  } catch (error) {
    console.error("[Keycloak] Échec de la connexion via le navigateur système", error);
    return false;
  }
}

const initKC = async () => {
  try {
    if (isTauriPlatform()) {
      const redirectUri = 'fr.silvercore.synco://callback';
      const token = localStorage.getItem('kc_token') || undefined;
      const refreshToken = localStorage.getItem('kc_refreshToken') || undefined;

      if (!token || isTokenExpired(token)) {
        // Pas de session valide en cache : on laisse l'UI proposer à
        // l'utilisateur de se connecter (bouton -> loginWithSystemBrowser),
        // plutôt que d'ouvrir un onglet de navigateur sans action de sa part.
        return false;
      }

      const authenticated = await keycloak.init({
        checkLoginIframe: false,
        redirectUri,
        responseMode: 'query',
        token,
        refreshToken,
      });

      if (authenticated) {
        if (keycloak.token) localStorage.setItem('kc_token', keycloak.token);
        if (keycloak.refreshToken) localStorage.setItem('kc_refreshToken', keycloak.refreshToken);
        const userInfo: any = await keycloak.loadUserInfo();
        localStorage.setItem('userId', userInfo.sub);
        kcToken.value = keycloak.token || '';
        setupTokenRefresh();
      }
      return authenticated;
    }

    if (Capacitor.isNativePlatform()) {
      const redirectUri = 'fr.silvercore.synco://callback';
      let token = localStorage.getItem('kc_token') || undefined;
      let refreshToken = localStorage.getItem('kc_refreshToken') || undefined;

      if (!token || isTokenExpired(token)) {
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
        if (keycloak.token) localStorage.setItem('kc_token', keycloak.token);
        if (keycloak.refreshToken) localStorage.setItem('kc_refreshToken', keycloak.refreshToken);
        const userInfo: any = await keycloak.loadUserInfo();
        localStorage.setItem('userId', userInfo.sub);
        kcToken.value = keycloak.token || '';
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
      kcToken.value = keycloak.token || '';
      setupTokenRefresh();
    }
    return authenticated;
  } catch (error) {
    console.error("[Keycloak] Erreur d'initialisation Keycloak", error);
    return false;
  }
};

export { initKC, setupTokenRefresh, onTokenRefresh, isTauriPlatform, loginWithSystemBrowser };