import { availableModels, type LLMModel, type Precision, type Tier } from './catalog';

export interface HardwareProfile {
    webgpu: boolean;
    unsupportedReason?: 'no-webgpu' | 'no-adapter' | 'software-adapter';
    vendor: string;
    architecture: string;
    description: string;
    shaderF16: boolean;
    maxStorageBufferBindingSize: number;
    /** Débit mémoire GPU mesuré (Go/s) : c'est lui qui borne la vitesse de génération d'un LLM. */
    bandwidthGBs: number | null;
    unifiedMemory: boolean;
    deviceMemoryGB: number | null;
    cores: number;
    mobile: boolean;
    storageFreeBytes: number | null;
}

export interface ModelAssessment {
    model: LLMModel;
    precision: Precision;
    fits: boolean;
    estTokensPerSec: number | null;
    blockers: string[];
}

export interface Recommendation {
    model: LLMModel;
    precision: Precision;
    assessments: ModelAssessment[];
}

const PROFILE_KEY = 'synco_local_ai_hw_v4';
const MAX_TIER_KEY = 'synco_local_ai_max_tier';
const GB = 1024 ** 3;

// Débit nécessaire pour une génération fluide (tokens/s). En dessous, on descend d'un tier.
const MIN_TOKENS_PER_SEC: Record<Tier, number> = { 1: 15, 2: 12, 3: 0 };
// Part du débit mémoire réellement exploitée par WebLLM en décodage (calé sur M1 / RTX 3060).
const DECODE_EFFICIENCY = 0.6;
const VRAM_MARGIN = 1.15;

const gpu = (): any => (typeof navigator !== 'undefined' ? (navigator as any).gpu : undefined);

const readCached = (): { sig: string; bandwidthGBs: number | null } | null => {
    try {
        return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    } catch {
        return null;
    }
};

/** Plus petit écart non nul entre deux lectures de performance.now() (Firefox peut l'arrondir à 100 ms). */
const timerResolutionMs = (): number => {
    let min = Infinity;
    const deadline = performance.now() + 400;
    for (let n = 0; n < 3 && performance.now() < deadline; n++) {
        const t0 = performance.now();
        let t1 = t0;
        while (t1 === t0 && performance.now() < deadline) t1 = performance.now();
        if (t1 > t0) min = Math.min(min, t1 - t0);
    }
    return Number.isFinite(min) ? min : 100;
};

/**
 * Copie GPU→GPU chronométrée. Le décodage d'un LLM relit tous les poids à chaque token, donc
 * le débit mémoire prédit la vitesse bien mieux que le nom de la carte — que les navigateurs
 * masquent (adapter.info vide sous Firefox / sans flag Chrome). Une fois par GPU.
 * Renvoie null si le chronomètre est trop grossier pour mesurer : une valeur fausse ferait
 * écarter à tort un bon GPU, alors qu'une valeur inconnue laisse le repli OOM faire son travail.
 */
const measureBandwidth = async (adapter: any): Promise<number | null> => {
    let device: any;
    try {
        const resolution = timerResolutionMs();

        device = await adapter.requestDevice();
        const GPUBufferUsage = (self as any).GPUBufferUsage;
        const size = 64 * 1024 * 1024;
        const src = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE });
        const dst = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE });

        const run = async (iterations: number) => {
            const enc = device.createCommandEncoder();
            for (let i = 0; i < iterations; i++) enc.copyBufferToBuffer(src, 0, dst, 0, size);
            const t0 = performance.now();
            device.queue.submit([enc.finish()]);
            await device.queue.onSubmittedWorkDone();
            return performance.now() - t0;
        };

        await run(2);
        // Latence de onSubmittedWorkDone à vide : Firefox répond par paliers de ~100 ms, ce qui
        // dépasserait n'importe quel seuil fixe et ferait mesurer la latence au lieu du GPU.
        const latency = Math.max(await run(0), await run(0), await run(0));
        // Temps mesuré ≥ 20 résolutions du chronomètre et ≥ 10 latences : erreur < 10 %.
        const targetMs = Math.max(40, resolution * 20, latency * 10);
        if (targetMs > 1500) {
            console.info(`[LocalLLM] Mesure GPU trop imprécise (chronomètre ${resolution} ms, latence ${Math.round(latency)} ms) : benchmark ignoré.`);
            src.destroy();
            dst.destroy();
            return null;
        }

        let iterations = 12;
        let elapsed = await run(iterations);
        while (elapsed < targetMs && iterations < 8192) {
            iterations *= 2;
            elapsed = await run(iterations);
        }
        src.destroy();
        dst.destroy();
        if (elapsed < targetMs) return null;
        // Lecture + écriture : 2 × taille par copie.
        return (2 * size * iterations) / (elapsed / 1000) / 1e9;
    } catch (e) {
        console.warn('[LocalLLM] Benchmark GPU impossible', e);
        return null;
    } finally {
        device?.destroy();
    }
};

const isUnifiedMemory = (vendor: string, architecture: string, bandwidth: number | null, mobile: boolean) => {
    if (mobile) return true;
    // Fabricant masqué : on ne peut pas savoir, le débit mesuré (ou le repli OOM) tranchera.
    if (!vendor) return false;
    if (vendor.includes('apple') || vendor.includes('qualcomm') || vendor.includes('arm')) return true;
    if (vendor.includes('intel')) return !/hp|alchemist|battlemage/.test(architecture);
    if (vendor.includes('nvidia')) return false;
    // AMD : même nom d'architecture pour APU et cartes dédiées, le débit tranche.
    if (vendor.includes('amd') || vendor.includes('ati')) return bandwidth !== null && bandwidth < 80;
    return true;
};

let profilePromise: Promise<HardwareProfile> | null = null;

export const getHardwareProfile = (): Promise<HardwareProfile> => {
    profilePromise ??= detect();
    return profilePromise;
};

const detect = async (): Promise<HardwareProfile> => {
    const nav: any = typeof navigator !== 'undefined' ? navigator : {};
    const mobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad/i.test(nav.userAgent || '');
    const base: HardwareProfile = {
        webgpu: false,
        vendor: '',
        architecture: '',
        description: '',
        shaderF16: false,
        maxStorageBufferBindingSize: 0,
        bandwidthGBs: null,
        unifiedMemory: true,
        deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
        cores: nav.hardwareConcurrency || 4,
        mobile,
        storageFreeBytes: null,
    };

    const storage = nav.storage?.estimate?.().catch(() => null);

    if (!gpu()) return { ...base, unsupportedReason: 'no-webgpu', storageFreeBytes: await freeBytes(storage) };

    const adapter = await gpu().requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
    if (!adapter) return { ...base, unsupportedReason: 'no-adapter', storageFreeBytes: await freeBytes(storage) };

    const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
    const vendor = (info.vendor || '').toLowerCase();
    const architecture = (info.architecture || '').toLowerCase();
    const description = (info.description || '').toLowerCase();
    if (info.isFallbackAdapter || adapter.isFallbackAdapter) {
        return { ...base, vendor, architecture, unsupportedReason: 'software-adapter', storageFreeBytes: await freeBytes(storage) };
    }

    const sig = `${vendor}|${architecture}|${description}|${adapter.limits.maxBufferSize}`;
    const cached = readCached();
    let bandwidthGBs: number | null;
    if (cached?.sig === sig) {
        bandwidthGBs = cached.bandwidthGBs;
    } else {
        bandwidthGBs = await measureBandwidth(adapter);
        try {
            localStorage.setItem(PROFILE_KEY, JSON.stringify({ sig, bandwidthGBs }));
        } catch { /* stockage indisponible : on remesurera */ }
    }

    return {
        ...base,
        webgpu: true,
        vendor,
        architecture,
        description,
        shaderF16: adapter.features.has('shader-f16'),
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        bandwidthGBs,
        unifiedMemory: isUnifiedMemory(vendor, architecture, bandwidthGBs, mobile),
        storageFreeBytes: await freeBytes(storage),
    };
};

const freeBytes = async (estimate: Promise<any> | undefined): Promise<number | null> => {
    const e = await estimate;
    return e?.quota ? e.quota - (e.usage || 0) : null;
};

/** Mémoire utilisable par le GPU, en Mo. WebGPU n'expose pas la VRAM : on l'estime. */
const gpuMemoryBudgetMB = (p: HardwareProfile): number => {
    if (p.unifiedMemory) {
        // navigator.deviceMemory est plafonné à 8 par Chrome et absent ailleurs ; une puce Apple
        // Pro/Max (≥ 16 Go) se reconnaît à son débit.
        let ramGB = p.deviceMemoryGB ?? 8;
        if (ramGB >= 8 && (p.bandwidthGBs ?? 0) >= 120) ramGB = 16;
        return ramGB * 1024 * 0.5;
    }
    // Le débit ne dit pas grand-chose de la VRAM (RTX 4060 : 8 Go sur un bus 128 bits) : on vise
    // large, le repli automatique sur VRAM insuffisante (capTierAfterFailure) corrige l'excès.
    if (p.bandwidthGBs === null) return 8 * 1024;
    const bw = p.bandwidthGBs;
    if (bw >= 150) return 8 * 1024;
    if (bw >= 90) return 4 * 1024;
    return 2 * 1024;
};

export const getMaxTierOverride = (): Tier | null => {
    try {
        const v = Number(localStorage.getItem(MAX_TIER_KEY));
        return v === 2 || v === 3 ? (v as Tier) : null;
    } catch {
        return null;
    }
};

/** Mémorise qu'un tier a échoué faute de mémoire GPU, pour ne plus le recommander ici. */
export const capTierAfterFailure = (failedTier: Tier) => {
    if (failedTier >= 3) return;
    try {
        localStorage.setItem(MAX_TIER_KEY, String(failedTier + 1));
    } catch { /* noop */ }
};

export const assessModel = (p: HardwareProfile, model: LLMModel, alreadyCachedBytes = 0): ModelAssessment => {
    const precision: Precision = p.shaderF16 ? 'f16' : 'f32';
    const variant = model.variants[precision];
    const blockers: string[] = [];

    if (!p.webgpu) blockers.push('WebGPU indisponible');
    if (!model.lowResource && p.maxStorageBufferBindingSize < GB) blockers.push('limites WebGPU trop basses');
    if (gpuMemoryBudgetMB(p) < variant.vramMB * VRAM_MARGIN) blockers.push('mémoire graphique insuffisante');
    if (p.deviceMemoryGB !== null && p.deviceMemoryGB < 4 && model.tier < 3) blockers.push('mémoire vive insuffisante');
    if (p.mobile && model.tier < 3) blockers.push('appareil mobile');
    const override = getMaxTierOverride();
    if (override && model.tier < override) blockers.push('échec de chargement précédent sur cette machine');
    if (p.storageFreeBytes !== null && p.storageFreeBytes < (variant.approxBytes - alreadyCachedBytes) * 1.05) {
        blockers.push('espace disque insuffisant');
    }

    const estTokensPerSec = p.bandwidthGBs ? (p.bandwidthGBs * 1e9 * DECODE_EFFICIENCY) / variant.approxBytes : null;
    if (estTokensPerSec !== null && estTokensPerSec < MIN_TOKENS_PER_SEC[model.tier]) blockers.push('génération trop lente');

    return { model, precision, fits: blockers.length === 0, estTokensPerSec, blockers };
};

export const recommendModel = (p: HardwareProfile): Recommendation => {
    const assessments = availableModels.map(m => assessModel(p, m));
    const best = [...assessments].sort((a, b) => a.model.tier - b.model.tier).find(a => a.fits);
    const pick = best ?? assessments.find(a => a.model.tier === 3)!;
    return { model: pick.model, precision: pick.precision, assessments };
};

/** Annule la limite mémorisée par capTierAfterFailure. */
export const resetTierCap = () => {
    try {
        localStorage.removeItem(MAX_TIER_KEY);
    } catch { /* noop */ }
};
