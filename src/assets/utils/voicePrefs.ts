export type VideoQualityMode = 'auto' | 'low' | 'medium' | 'high';

export interface VoiceDevicePrefs {
    micDeviceId?: string;
    camDeviceId?: string;
    speakerDeviceId?: string;
    camResolution: { width: number; height: number };
    camFrameRate: number;
    screenResolution: { width: number; height: number };
    screenFrameRate: number;
    qualityMode: VideoQualityMode;
}

const STORAGE_KEY = 'synco:voiceDevicePrefs';

export const RESOLUTION_PRESETS: Record<'480p' | '720p' | '1080p', { width: number; height: number }> = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
};

export const FRAMERATE_PRESETS = [15, 30, 60];

const DEFAULT_PREFS: VoiceDevicePrefs = {
    camResolution: RESOLUTION_PRESETS['720p'],
    camFrameRate: 30,
    screenResolution: RESOLUTION_PRESETS['1080p'],
    screenFrameRate: 30,
    qualityMode: 'auto',
};

export function getVoicePrefs(): VoiceDevicePrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_PREFS };
        return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

export function saveVoicePrefs(partial: Partial<VoiceDevicePrefs>) {
    try {
        const current = getVoicePrefs();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
    } catch {
        // localStorage indisponible : préférence non persistée pour cette session, sans impact fonctionnel
    }
}

/**
 * Choisit un preset de résolution/framerate initial pour la caméra en mode
 * "Auto", à partir de la Network Information API (Chrome/Edge uniquement —
 * navigator.connection est undefined ailleurs, d'où le repli sur 720p/30fps).
 */
export function getAutoVideoQuality(): { resolution: { width: number; height: number }; frameRate: number } {
    const conn = (navigator as any).connection;
    const downlink: number | undefined = conn?.downlink;

    if (typeof downlink === 'number') {
        if (downlink < 1.5) return { resolution: RESOLUTION_PRESETS['480p'], frameRate: 15 };
        if (downlink < 4) return { resolution: RESOLUTION_PRESETS['720p'], frameRate: 24 };
        return { resolution: RESOLUTION_PRESETS['1080p'], frameRate: 30 };
    }

    return { resolution: RESOLUTION_PRESETS['720p'], frameRate: 30 };
}

const QUALITY_MODE_PRESETS: Record<Exclude<VideoQualityMode, 'auto'>, { resolution: { width: number; height: number }; frameRate: number }> = {
    low: { resolution: RESOLUTION_PRESETS['480p'], frameRate: 15 },
    medium: { resolution: RESOLUTION_PRESETS['720p'], frameRate: 30 },
    high: { resolution: RESOLUTION_PRESETS['1080p'], frameRate: 30 },
};

export function resolveCameraCaptureOptions(prefs: VoiceDevicePrefs): { resolution: { width: number; height: number }; frameRate: number } {
    if (prefs.qualityMode === 'auto') return getAutoVideoQuality();
    return QUALITY_MODE_PRESETS[prefs.qualityMode];
}
