import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { Track, type AudioProcessorOptions, type TrackProcessor } from 'livekit-client';

// Chargement du binaire WASM et enregistrement du worklet une seule fois,
// réutilisés par chaque instance/restart du processor (changement de micro,
// reconnexion) plutôt que de refetch à chaque fois.
let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;
function getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
    if (!wasmBinaryPromise) {
        wasmBinaryPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseWasmSimdUrl });
    }
    return wasmBinaryPromise;
}

const registeredContexts = new WeakMap<AudioContext, Promise<void>>();
function ensureWorkletModule(ctx: AudioContext): Promise<void> {
    let pending = registeredContexts.get(ctx);
    if (!pending) {
        pending = ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
        registeredContexts.set(ctx, pending);
    }
    return pending;
}

/**
 * Suppression de bruit locale (RNNoise, WASM) appliquée à la piste micro
 * avant publication LiveKit. Gratuite et 100% client — contrairement au
 * plugin Krisp officiel de LiveKit, qui exige LiveKit Cloud (non applicable
 * ici, le SFU Synco est self-hosted).
 */
export class RNNoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
    name = 'rnnoise-noise-suppression';
    processedTrack?: MediaStreamTrack;

    private sourceNode?: MediaStreamAudioSourceNode;
    private rnnoiseNode?: RnnoiseWorkletNode;
    private destinationNode?: MediaStreamAudioDestinationNode;

    async init(opts: AudioProcessorOptions) {
        const ctx = opts.audioContext;
        try {
            if (typeof AudioWorkletNode === 'undefined') {
                throw new Error('AudioWorklet non supporté par ce navigateur');
            }
            await ensureWorkletModule(ctx);
            const wasmBinary = await getRnnoiseWasmBinary();

            this.rnnoiseNode = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
            this.sourceNode = ctx.createMediaStreamSource(new MediaStream([opts.track]));
            this.destinationNode = ctx.createMediaStreamDestination();
            this.sourceNode.connect(this.rnnoiseNode).connect(this.destinationNode);
            this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
        } catch (e) {
            // Dégradation gracieuse : la piste micro brute reste publiée plutôt
            // que de faire échouer tout l'appel pour un suppresseur de bruit.
            console.error('[RNNoise] Indisponible, piste micro non traitée:', e);
            this.processedTrack = opts.track;
        }
    }

    async restart(opts: AudioProcessorOptions) {
        await this.disconnectGraph();
        await this.init(opts);
    }

    async destroy() {
        await this.disconnectGraph();
    }

    private async disconnectGraph() {
        this.sourceNode?.disconnect();
        this.rnnoiseNode?.disconnect();
        this.rnnoiseNode?.destroy();
        this.destinationNode?.disconnect();
        this.sourceNode = undefined;
        this.rnnoiseNode = undefined;
        this.destinationNode = undefined;
    }
}
