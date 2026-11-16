import { ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import sfetch from '@/assets/utils/sfetch';
import { keycloak, isTauriPlatform } from '@/assets/keycloak';
import { user } from '@/assets/var';
import { E2EEUnloked } from '@/assets/utils/crypto';
import { isV4Account, vaultFor } from '@/assets/e2eeV4/runtime';
import { detectPlatform, getLocalDevice, idbStore, preferredVaults } from '@/assets/deviceVault';
import { lastVaultUsage } from '@/assets/deviceVault/usage';
import { loadRefreshToken } from '@/assets/secureTokenStore';
import type { DevicePlatform } from '@/assets/deviceVault/localDevice';
import type { VaultCapabilities, VaultKind } from '@/assets/deviceVault/types';

/**
 * Collecte des informations de la vue « Développeur » (paramètres utilisateur, onglet caché) :
 * build de l'appli, état et version de chaque service vu depuis CET appareil, coffre de clés.
 * Rien de secret n'est lu ni affiché : présence des clés uniquement, jamais leur valeur.
 */

export type ProbeStatus = 'checking' | 'up' | 'degraded' | 'down' | 'unconfigured';

export interface ServiceRow {
    id: 'api' | 'socket' | 'keyguard' | 'keycloak' | 'cdn' | 'database';
    label: string;
    icon: string;
    status: ProbeStatus;
    /** Latence mesurée depuis l'appareil (ou par l'API pour la base). */
    latencyMs: number | null;
    version: string | null;
    commit: string | null;
    url: string | null;
    /** Précisions : erreur, état vu par l'API, realm… */
    details: string[];
}

export interface InfoLine {
    label: string;
    value: string;
    mono?: boolean;
    tone?: 'ok' | 'warn' | 'error';
}

export interface VaultReport {
    platform: DevicePlatform;
    expected: VaultKind | null;
    enrolled: boolean;
    kind: VaultKind | null;
    deviceId: string | null;
    enrolledAt: number | null;
    capabilities: VaultCapabilities | null;
    /** La clé d'appareil est présente dans le coffre (true/false), ou erreur de lecture. */
    keyPresent: boolean | null;
    keyError: string | null;
    usage: typeof lastVaultUsage.value;
    unlocked: boolean;
    v4: boolean;
    /** Plateformes natives : jeton de rafraîchissement présent dans le trousseau. */
    refreshTokenStored: boolean | null;
    extra: InfoLine[];
}

interface ApiSystemInfo {
    api: { version: string; commit: string | null; builtAt: string | null; startedAt: string; uptimeSeconds: number; runtime: string; environment: string };
    database: { status: string; latencyMs: number | null; error?: string };
    keycloak: { status: string; latencyMs: number | null; version: string | null; url?: string | null; realm: string | null; error?: string };
    cdn: { status: string; latencyMs: number | null; version: string | null; commit: string | null; url?: string | null; error?: string };
    checkedAt: string;
}

const PROBE_TIMEOUT_MS = 5000;

export const VAULT_LABELS: Record<VaultKind, string> = {
    'os-keyring': 'Trousseau du système',
    'native-biometric': 'Keychain / Keystore + biométrie',
    'webauthn-prf': 'Passkey (WebAuthn PRF)',
    'extension': 'Synco Extension',
    'web-pin': 'PIN local (navigateur)',
};

const PLATFORM_NAMES: Record<DevicePlatform, string> = {
    web: 'Application web',
    desktop: 'Application de bureau (Tauri)',
    android: 'Application Android',
    ios: 'Application iOS',
};

const errorText = (e: unknown) =>
    e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'délai dépassé'
        : e instanceof Error ? e.message : String(e);

const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 8) : null);

async function timedFetch(url: string, init?: RequestInit): Promise<{ res: Response; latencyMs: number }> {
    const start = performance.now();
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), ...init });
    return { res, latencyMs: Math.round(performance.now() - start) };
}

/** Joignabilité seule quand le CORS interdit de lire la réponse (réponse opaque = serveur atteint). */
async function reachableOpaque(url: string): Promise<number | null> {
    try {
        const { latencyMs } = await timedFetch(url, { mode: 'no-cors' });
        return latencyMs;
    } catch {
        return null;
    }
}

const apiStatus = (s: string | undefined): ProbeStatus =>
    s === 'up' ? 'up' : s === 'unconfigured' ? 'unconfigured' : 'down';

function row(id: ServiceRow['id'], label: string, icon: string, url: string | null = null): ServiceRow {
    return { id, label, icon, status: 'checking', latencyMs: null, version: null, commit: null, url, details: [] };
}

export function formatDuration(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d) return `${d} j ${h} h`;
    if (h) return `${h} h ${m} min`;
    if (m) return `${m} min`;
    return `${seconds} s`;
}

export function formatDate(value: string | number | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------------------------------------------------------------------------
// Application (ce client)
// ---------------------------------------------------------------------------

async function collectApp(platform: DevicePlatform): Promise<InfoLine[]> {
    const lines: InfoLine[] = [
        { label: 'Plateforme', value: PLATFORM_NAMES[platform] },
        { label: 'Version du build', value: __APP_BUILD__.version, mono: true },
        { label: 'Commit', value: shortSha(__APP_BUILD__.commit) ?? 'inconnu', mono: true },
        { label: 'Date du build', value: formatDate(__APP_BUILD__.builtAt) },
        { label: 'Mode', value: import.meta.env.DEV ? 'développement' : 'production', tone: import.meta.env.DEV ? 'warn' : undefined },
    ];

    if (platform === 'desktop') {
        try {
            const { getVersion, getTauriVersion, getIdentifier } = await import('@tauri-apps/api/app');
            const [version, tauri, identifier] = await Promise.all([getVersion(), getTauriVersion(), getIdentifier()]);
            lines.push(
                { label: 'Version installée', value: version, mono: true, tone: version !== __APP_BUILD__.version ? 'warn' : undefined },
                { label: 'Runtime Tauri', value: tauri, mono: true },
                { label: 'Identifiant', value: identifier, mono: true },
            );
        } catch (e) {
            lines.push({ label: 'Tauri', value: `indisponible (${errorText(e)})`, tone: 'error' });
        }
    } else if (platform === 'android' || platform === 'ios') {
        try {
            const { App } = await import('@capacitor/app');
            const info = await App.getInfo();
            lines.push(
                { label: 'Version native', value: `${info.version} (build ${info.build})`, mono: true },
                { label: 'Identifiant', value: info.id, mono: true },
            );
        } catch (e) {
            lines.push({ label: 'Capacitor', value: `indisponible (${errorText(e)})`, tone: 'error' });
        }
    }

    lines.push(
        { label: 'Connexion réseau', value: navigator.onLine ? 'en ligne' : 'hors ligne', tone: navigator.onLine ? 'ok' : 'error' },
        { label: 'Moteur', value: navigator.userAgent, mono: true },
    );
    return lines;
}

/** Informations propres au mobile : biométrie, notifications push. */
async function collectMobile(platform: DevicePlatform): Promise<InfoLine[]> {
    if (platform !== 'android' && platform !== 'ios') return [];
    const lines: InfoLine[] = [];
    try {
        const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
        const info = await BiometricAuth.checkBiometry();
        const types = ['aucune', 'Touch ID', 'Face ID', 'empreinte', 'visage', 'iris'];
        lines.push(
            { label: 'Biométrie', value: info.isAvailable ? `disponible (${types[info.biometryType] ?? info.biometryType})` : 'indisponible', tone: info.isAvailable ? 'ok' : 'warn' },
            { label: 'Biométrie forte', value: info.strongBiometryIsAvailable ? 'oui' : 'non' },
            { label: 'Verrouillage d\'écran', value: info.deviceIsSecure ? 'configuré' : 'absent', tone: info.deviceIsSecure ? 'ok' : 'error' },
        );
    } catch (e) {
        lines.push({ label: 'Biométrie', value: `erreur (${errorText(e)})`, tone: 'error' });
    }
    try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        lines.push({ label: 'Notifications push', value: perm.receive, tone: perm.receive === 'granted' ? 'ok' : 'warn' });
    } catch (e) {
        lines.push({ label: 'Notifications push', value: `erreur (${errorText(e)})`, tone: 'error' });
    }
    lines.push({ label: 'Plateforme Capacitor', value: Capacitor.getPlatform(), mono: true });
    return lines;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

async function probeApi(r: ServiceRow, system: Promise<ApiSystemInfo | null>) {
    try {
        const { res, latencyMs } = await timedFetch(`${r.url}/health`);
        r.latencyMs = latencyMs;
        r.status = res.ok ? 'up' : 'down';
        if (!res.ok) r.details.push(`/health : HTTP ${res.status}`);
    } catch (e) {
        r.status = 'down';
        r.details.push(errorText(e));
    }
    const info = await system;
    if (info) {
        r.version = info.api.version;
        r.commit = shortSha(info.api.commit);
        r.details.push(`${info.api.runtime} · ${info.api.environment} · en ligne depuis ${formatDuration(info.api.uptimeSeconds)}`);
        if (info.api.builtAt) r.details.push(`build du ${formatDate(info.api.builtAt)}`);
    } else if (r.status === 'up') {
        r.status = 'degraded';
        r.details.push('/api/system/info injoignable (API antérieure ?)');
    }
}

async function probeKeyguard(r: ServiceRow) {
    if (!r.url) {
        r.status = 'unconfigured';
        r.details.push('VITE_KEYGUARD_URL absent : récupération par PIN désactivée');
        return;
    }
    try {
        const { res, latencyMs } = await timedFetch(`${r.url}/health`);
        r.latencyMs = latencyMs;
        const body = await res.json().catch(() => ({})) as { ok?: boolean; version?: string; commit?: string | null };
        r.status = res.ok && body.ok ? 'up' : 'down';
        r.version = body.version ?? null;
        r.commit = shortSha(body.commit);
        if (!res.ok) r.details.push(`HTTP ${res.status}`);
    } catch (e) {
        r.status = 'down';
        r.details.push(errorText(e));
    }
}

async function probeKeycloak(r: ServiceRow, system: Promise<ApiSystemInfo | null>) {
    const realm = import.meta.env.VITE_KEYCLOAK_REALM;
    if (!r.url || !realm) {
        r.status = 'unconfigured';
        return;
    }
    r.details.push(`realm ${realm} · client ${import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? '?'}`);
    try {
        const { res, latencyMs } = await timedFetch(`${r.url}/realms/${encodeURIComponent(realm)}/.well-known/openid-configuration`);
        r.latencyMs = latencyMs;
        r.status = res.ok ? 'up' : 'down';
        if (!res.ok) r.details.push(`HTTP ${res.status}`);
    } catch (e) {
        r.status = 'down';
        r.details.push(errorText(e));
    }
    if (keycloak.tokenParsed?.exp) {
        const left = keycloak.tokenParsed.exp - Math.floor(Date.now() / 1000);
        r.details.push(left > 0 ? `jeton d'accès valable encore ${formatDuration(left)}` : 'jeton d\'accès expiré');
    }
    const info = await system;
    if (info) {
        r.version = info.keycloak.version;
        if (!info.keycloak.version) r.details.push('version non exposée au compte de service de l\'API');
        if (info.keycloak.status !== 'up') r.details.push(`vu par l'API : ${info.keycloak.status}${info.keycloak.error ? ` (${info.keycloak.error})` : ''}`);
    }
}

async function probeCdn(r: ServiceRow, system: Promise<ApiSystemInfo | null>) {
    const info = await system;
    r.url = info?.cdn.url ?? null;
    if (!r.url) {
        r.status = info ? 'unconfigured' : 'down';
        r.details.push(info ? 'non configuré côté API' : 'URL inconnue (API injoignable)');
        return;
    }
    r.version = info?.cdn.version ?? null;
    r.commit = shortSha(info?.cdn.commit);
    try {
        const { res, latencyMs } = await timedFetch(`${r.url}/healthz`);
        r.latencyMs = latencyMs;
        r.status = res.ok ? 'up' : 'down';
        r.version = res.headers.get('x-synco-version') ?? r.version;
        r.commit = shortSha(res.headers.get('x-synco-commit')) ?? r.commit;
        if (!res.ok) r.details.push(`HTTP ${res.status}`);
    } catch {
        // CORS refusé (origine hors liste blanche du CDN) : on vérifie au moins la joignabilité.
        const latency = await reachableOpaque(`${r.url}/healthz`);
        r.latencyMs = latency;
        r.status = latency !== null ? 'degraded' : 'down';
        r.details.push(latency !== null ? 'joignable, mais cette origine n\'est pas autorisée en CORS' : 'injoignable depuis cet appareil');
    }
    if (info && info.cdn.status !== 'up') r.details.push(`vu par l'API : ${info.cdn.status}${info.cdn.error ? ` (${info.cdn.error})` : ''}`);
}

async function probeDatabase(r: ServiceRow, system: Promise<ApiSystemInfo | null>) {
    const info = await system;
    if (!info) {
        r.status = 'down';
        r.details.push('état inconnu (API injoignable)');
        return;
    }
    r.status = apiStatus(info.database.status);
    r.latencyMs = info.database.latencyMs;
    r.details.push('mesuré par l\'API');
    if (info.database.error) r.details.push(info.database.error);
}

async function probeSocket(r: ServiceRow) {
    const { isConnected, connectionAttempted } = await import('@/composables/useWSocket');
    if (!connectionAttempted.value) {
        r.status = 'unconfigured';
        r.details.push('pas encore de connexion tentée');
        return;
    }
    r.status = isConnected.value ? 'up' : 'down';
    r.details.push(isConnected.value ? 'connecté (temps réel actif)' : 'déconnecté : reconnexion en cours');
}

// ---------------------------------------------------------------------------
// Coffre de clés
// ---------------------------------------------------------------------------

async function collectVault(platform: DevicePlatform): Promise<VaultReport> {
    const report: VaultReport = {
        platform, expected: null, enrolled: false, kind: null, deviceId: null, enrolledAt: null, capabilities: null,
        keyPresent: null, keyError: null, usage: lastVaultUsage.value, unlocked: E2EEUnloked.value,
        v4: isV4Account(user.value?.pinSalt), refreshTokenStored: null, extra: [],
    };

    try {
        report.expected = (await preferredVaults())[0]?.capabilities.kind ?? null;
    } catch {
        report.expected = null;
    }

    const userId = user.value?.id;
    if (userId) {
        const record = await getLocalDevice(idbStore, userId).catch(() => undefined);
        if (record) {
            report.enrolled = true;
            report.kind = record.vaultKind;
            report.deviceId = record.deviceId;
            report.enrolledAt = record.createdAt;
            try {
                const vault = await vaultFor(record.vaultKind);
                if (!vault) {
                    report.keyError = 'coffre indisponible sur cette plateforme';
                } else {
                    report.capabilities = vault.capabilities;
                    report.keyPresent = await vault.has(record.deviceId);
                }
            } catch (e) {
                report.keyError = errorText(e);
            }
        }
    }

    if (platform !== 'web') {
        try {
            report.refreshTokenStored = (await loadRefreshToken()) !== undefined;
        } catch (e) {
            report.refreshTokenStored = false;
            report.extra.push({ label: 'Lecture du trousseau', value: errorText(e), tone: 'error' });
        }
    }

    if (platform === 'desktop') {
        const ua = navigator.userAgent;
        const store = /Windows/.test(ua) ? 'Gestionnaire d\'identifiants Windows'
            : /Mac OS X|Macintosh/.test(ua) ? 'Trousseau macOS (Keychain)' : 'Secret Service (GNOME Keyring / KWallet)';
        report.extra.push({ label: 'Trousseau utilisé', value: store }, { label: 'Service', value: 'fr.silvercore.synco', mono: true });
    }
    return report;
}

// ---------------------------------------------------------------------------

export function useDevInfo() {
    const loading = ref(false);
    const platform = ref<DevicePlatform>('web');
    const app = ref<InfoLine[]>([]);
    const mobile = ref<InfoLine[]>([]);
    const services = ref<ServiceRow[]>([]);
    const vault = ref<VaultReport | null>(null);
    const system = ref<ApiSystemInfo | null>(null);
    const checkedAt = ref<number | null>(null);

    async function refresh() {
        if (loading.value) return;
        loading.value = true;
        try {
            platform.value = await detectPlatform().catch(() => (isTauriPlatform() ? 'desktop' : 'web'));

            const rows = [
                row('api', 'API', 'bi-hdd-rack', import.meta.env.VITE_API_URL ?? null),
                row('socket', 'WebSocket', 'bi-broadcast', import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_URL ?? null),
                row('database', 'Base de données', 'bi-database'),
                row('keycloak', 'Keycloak', 'bi-person-badge', import.meta.env.VITE_KEYCLOAK_URL ?? null),
                row('keyguard', 'Keyguard', 'bi-shield-lock', import.meta.env.VITE_KEYGUARD_URL?.replace(/\/+$/, '') || null),
                row('cdn', 'CDN', 'bi-cloud-arrow-up', null),
            ];
            services.value = rows;
            // Les lignes sont réactives : chaque sonde met à jour la sienne dès qu'elle répond.
            const live = services.value;
            const byId = (id: ServiceRow['id']) => live.find(r => r.id === id)!;

            const systemInfo = sfetch('/api/system/info')
                .then(res => (res.ok ? res.json() as Promise<ApiSystemInfo> : null))
                .catch(() => null);
            systemInfo.then(info => { system.value = info; });

            await Promise.all([
                collectApp(platform.value).then(v => { app.value = v; }),
                collectMobile(platform.value).then(v => { mobile.value = v; }),
                collectVault(platform.value).then(v => { vault.value = v; }),
                probeApi(byId('api'), systemInfo),
                probeSocket(byId('socket')),
                probeDatabase(byId('database'), systemInfo),
                probeKeycloak(byId('keycloak'), systemInfo),
                probeKeyguard(byId('keyguard')),
                probeCdn(byId('cdn'), systemInfo),
            ]);
            checkedAt.value = Date.now();
        } finally {
            loading.value = false;
        }
    }

    /** Rapport texte à coller dans un ticket : aucune donnée secrète (ni jeton, ni clé). */
    function report(): string {
        const out: string[] = [`Synco — rapport technique (${new Date().toISOString()})`, '', '## Application'];
        for (const l of [...app.value, ...mobile.value]) out.push(`- ${l.label} : ${l.value}`);
        out.push('', '## Services');
        for (const s of services.value) {
            out.push(`- ${s.label} : ${s.status}${s.version ? ` · v${s.version}` : ''}${s.commit ? ` (${s.commit})` : ''}${s.latencyMs !== null ? ` · ${s.latencyMs} ms` : ''}${s.url ? ` · ${s.url}` : ''}`);
            for (const d of s.details) out.push(`  - ${d}`);
        }
        const v = vault.value;
        if (v) {
            out.push('', '## Coffre de clés');
            out.push(`- Attendu : ${v.expected ?? '?'} · utilisé : ${v.kind ?? 'aucun'}`);
            out.push(`- Clé d'appareil présente : ${v.keyPresent === null ? (v.keyError ?? '?') : v.keyPresent ? 'oui' : 'non'}`);
            out.push(`- Déverrouillages ce lancement : ${v.usage?.count ?? 0}`);
            out.push(`- Session E2EE : ${v.unlocked ? 'déverrouillée' : 'verrouillée'} · compte v4 : ${v.v4 ? 'oui' : 'non'}`);
            if (v.refreshTokenStored !== null) out.push(`- Jeton de rafraîchissement dans le trousseau : ${v.refreshTokenStored ? 'oui' : 'non'}`);
        }
        return out.join('\n');
    }

    return { loading, platform, app, mobile, services, vault, system, checkedAt, refresh, report };
}
