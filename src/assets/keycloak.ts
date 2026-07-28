// keycloak.ts
import Keycloak from "keycloak-js";
import { kcToken } from "./var";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080/auth';
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'SilverTeams';
const KC_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'silverteams_web_app';

const keycloak = new Keycloak({
  url: KC_URL,
  realm: KC_REALM,
  clientId: KC_CLIENT_ID,
});

// --- Refresh automatique du token ---
const setupTokenRefresh = () => {
  keycloak.onTokenExpired = () => {
    keycloak.updateToken(30)
      .then((refreshed) => {
        if (refreshed) {
          kcToken.value = keycloak.token || '';
          if (Capacitor.isNativePlatform()) {
            if (keycloak.token) localStorage.setItem('kc_token', keycloak.token);
            if (keycloak.refreshToken) localStorage.setItem('kc_refreshToken', keycloak.refreshToken);
          }
        }
      })
      .catch((err) => {
        console.error('[Keycloak] Échec du refresh du token', err);
      });
  };
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

  // Nettoyage du listener une fois le deep link reçu
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

const initKC = async () => {
  try {
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
      onLoad: 'check-sso',
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

export { keycloak, initKC, setupTokenRefresh, onTokenRefresh };