import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import sfetch from './utils/sfetch';
import { debugLog, debugWarn } from './utils/debugLog';

/**
 * Notifications push de l'app mobile (Capacitor, @capacitor/push-notifications).
 *
 * Android : le token est un token FCM, enregistré sur synco_api en `platform: 'fcm'` (fcmService.ts).
 * iOS : le plugin renvoie le token APNs brut, enregistré en `platform: 'apns'` (apnsService.ts).
 *
 * Tant que l'app est au premier plan, le système n'affiche rien et la notification arrive déjà par
 * le WebSocket (popup + son de Notifications.vue). App en arrière-plan ou fermée : le système affiche
 * le push envoyé par le serveur, et le tap ouvre l'écran correspondant (data.notificationId, data.type,
 * data.route, cf. notificationService.ts côté API).
 *
 * Hors Capacitor (web, Tauri) tout est inerte.
 */

/** Canal Android, repris par synco_api (android.notification.channelId) et AndroidManifest.xml. */
const ANDROID_CHANNEL_ID = 'synco';
/** Identifiant stable de l'appareil : le serveur désactive les anciens tokens du même appareil. */
const DEVICE_ID_KEY = 'synco-push-device-id';
/** Dernier enregistrement réussi ({ userId, token, id }), pour ne pas recréer une ligne à chaque lancement. */
const REGISTRATION_KEY = 'synco-push-registration';

export interface PushTapData {
    notificationId?: string;
    type?: string;
    [key: string]: string | undefined;
}

interface Registration { userId: string; token: string; id: string }

/** Plugin local Android (PushSupportPlugin.java) : Firebase est-il configuré dans ce build ? */
const PushSupport = registerPlugin<{ isConfigured(): Promise<{ configured: boolean }> }>('PushSupport');

/** Android sans google-services.json : register() ferait planter l'app (exception native relancée). */
async function pushConfigured(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return true;
    try {
        return (await PushSupport.isConfigured()).configured;
    } catch {
        return false;
    }
}

let handles: PluginListenerHandle[] = [];
let startedFor: string | null = null;

const isNativePushPlatform = () => Capacitor.isNativePlatform();

function deviceId(): string {
    try {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    } catch {
        return crypto.randomUUID();
    }
}

function readRegistration(): Registration | null {
    try {
        return JSON.parse(localStorage.getItem(REGISTRATION_KEY) ?? 'null');
    } catch {
        return null;
    }
}

function writeRegistration(reg: Registration | null) {
    try {
        if (reg) localStorage.setItem(REGISTRATION_KEY, JSON.stringify(reg));
        else localStorage.removeItem(REGISTRATION_KEY);
    } catch { /* stockage indisponible : on réenregistrera au prochain lancement */ }
}

async function registerOnServer(userId: string, token: string): Promise<void> {
    const previous = readRegistration();
    if (previous?.userId === userId && previous.token === token) return;

    const platform = Capacitor.getPlatform() === 'ios' ? 'apns' : 'fcm';
    const res = await sfetch('/api/notifications/tokens', {
        method: 'POST',
        body: JSON.stringify({
            token,
            platform,
            deviceId: deviceId(),
            deviceInfo: { os: Capacitor.getPlatform(), userAgent: navigator.userAgent },
        }),
    });
    if (!res.ok) throw new Error(`enregistrement du token refusé (${res.status})`);
    const { id } = await res.json() as { id: string };
    writeRegistration({ userId, token, id });
    debugLog(`[push] token ${platform} enregistré`);
}

/**
 * Demande la permission, enregistre l'appareil auprès de synco_api et branche le tap sur `onTap`.
 * À appeler une fois l'utilisateur chargé. Idempotent pour un même utilisateur.
 */
export async function startNativePush(userId: string, onTap: (data: PushTapData) => void): Promise<void> {
    if (!isNativePushPlatform() || startedFor === userId) return;
    await stopListeners();
    startedFor = userId;

    if (!(await pushConfigured())) {
        debugWarn('[push] Firebase non configuré dans ce build (google-services.json absent) : pas de push');
        return;
    }

    try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Branché avant tout le reste : un tap qui a lancé l'app est retenu par le plugin
        // jusqu'à ce qu'un écouteur le consomme.
        handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            onTap((action.notification.data ?? {}) as PushTapData);
        }));
        handles.push(await PushNotifications.addListener('registration', ({ value }) => {
            registerOnServer(userId, value).catch((e) => debugWarn('[push] enregistrement serveur impossible', e));
        }));
        handles.push(await PushNotifications.addListener('registrationError', (e) => {
            debugWarn('[push] enregistrement FCM/APNs impossible', e);
        }));

        let { receive } = await PushNotifications.checkPermissions();
        if (receive === 'prompt' || receive === 'prompt-with-rationale') {
            ({ receive } = await PushNotifications.requestPermissions());
        }
        if (receive !== 'granted') {
            debugLog('[push] permission refusée');
            return;
        }

        if (Capacitor.getPlatform() === 'android') {
            await PushNotifications.createChannel({
                id: ANDROID_CHANNEL_ID,
                name: 'Synco',
                description: 'Messages, mentions, appels et rappels',
                importance: 4,
                visibility: 0,
                vibration: true,
            });
        }

        await PushNotifications.register();
    } catch (e) {
        debugWarn('[push] initialisation impossible', e);
    }
}

async function stopListeners(): Promise<void> {
    const current = handles;
    handles = [];
    startedFor = null;
    await Promise.all(current.map((h) => h.remove().catch(() => {})));
}

/**
 * À la déconnexion, avant de purger la session : retire le token de synco_api puis l'invalide
 * côté FCM/APNs, pour que ce téléphone ne reçoive plus les notifications du compte.
 */
export async function stopNativePush(): Promise<void> {
    if (!isNativePushPlatform()) return;
    const reg = readRegistration();
    writeRegistration(null);
    await stopListeners();
    if (reg) {
        await sfetch(`/api/notifications/tokens/${encodeURIComponent(reg.id)}`, { method: 'DELETE' }).catch(() => {});
    }
    if (!(await pushConfigured())) return;
    try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.unregister();
        await PushNotifications.removeAllDeliveredNotifications();
    } catch { /* plugin indisponible : rien à invalider */ }
}
