<template>
    <div v-if="status !== 'ready'"
        class="px-6 py-4 border-t border-(--border-color) bg-black/20 flex flex-col gap-3 shrink-0">

        <div v-if="localLLM.notice.value"
            class="flex items-start gap-3 bg-(--primary)/10 border border-(--primary)/20 p-3 rounded-xl text-xs text-(--text)/80">
            <i class="bi bi-info-circle text-(--primary) text-base"></i>
            <p class="flex-1">{{ localLLM.notice.value }}</p>
        </div>

        <div v-if="status === 'detecting'" class="flex items-center gap-2 text-xs text-(--text)/60">
            <i class="bi bi-cpu animate-pulse text-(--primary)"></i>
            Analyse de votre matériel…
        </div>

        <div v-else-if="status === 'unsupported'"
            class="flex items-start gap-4 bg-red-950/40 border-l-4 border-red-500 p-5 rounded-r-xl rounded-l-sm shadow-lg">
            <div class="bg-red-500/20 p-2 rounded-full shrink-0 mt-1">
                <i class="bi bi-x-circle-fill text-2xl text-red-500"></i>
            </div>
            <div class="flex-1">
                <h4 class="text-red-400 font-black text-base uppercase tracking-wider mb-2">Matériel non compatible</h4>
                <p class="text-sm text-(--text)/90 leading-relaxed mb-4">
                    L'agent IA local nécessite l'accélération matérielle <strong>WebGPU</strong>.
                    <template v-if="profile?.unsupportedReason === 'software-adapter'">
                        Votre navigateur n'expose qu'un rendu logiciel, beaucoup trop lent pour un modèle de langage.
                    </template>
                    <template v-else>Aucune carte graphique compatible n'a été détectée dans votre navigateur.</template>
                </p>
                <div class="bg-black/40 p-4 rounded-lg border border-(--border-color) text-sm text-(--text)/80">
                    <p class="font-bold text-red-300 mb-2 flex items-center gap-2"><i class="bi bi-wrench-adjustable"></i>
                        Pistes de résolution :</p>
                    <ul class="list-disc ml-5 space-y-2">
                        <li><strong>Linux :</strong> l'accélération WebGPU est souvent bloquée. Nous recommandons
                            <strong>Chromium ou Chrome sous Windows ou macOS</strong> pour profiter de l'IA locale.</li>
                        <li><strong>Pilotes :</strong> vérifiez que vos pilotes graphiques sont à jour.</li>
                        <li v-if="profile?.unsupportedReason !== 'no-webgpu'">WebGPU est activé dans votre navigateur, mais
                            l'accès à la carte graphique a échoué (problème OS/pilotes).</li>
                        <li v-else>Utilisez une version récente de <strong>Google Chrome, Edge ou Brave</strong>.</li>
                    </ul>
                </div>
            </div>
        </div>

        <template v-else-if="status === 'idle' || status === 'error'">
            <div v-if="localLLM.error.value"
                class="flex items-center gap-4 bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                <i class="bi bi-x-circle text-2xl text-red-500"></i>
                <div class="flex-1">
                    <h4 class="text-red-500 font-bold text-sm">{{ errorTitle }}</h4>
                    <p class="text-xs text-red-500/80 mt-1">{{ localLLM.error.value.message }}</p>
                </div>
            </div>

            <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                <div class="text-sm">
                    <p class="font-bold text-(--text)/80">
                        <template v-if="isCached">{{ model?.name }} est prêt à être chargé</template>
                        <template v-else-if="isPartial">Téléchargement interrompu à {{ partialPercent }} %</template>
                        <template v-else>Téléchargement initial de Synco AI requis</template>
                    </p>
                    <p class="text-(--text)/50 text-xs mt-0.5">
                        <span class="font-mono text-(--primary)">{{ model?.name }}</span>
                        <template v-if="isRecommended"> · recommandé pour votre machine</template>
                        <template v-if="assessment?.estTokensPerSec"> · ≈ {{ Math.round(assessment.estTokensPerSec) }} tokens/s</template>
                        <template v-if="sizeLabel && !isCached"> · {{ sizeLabel }}</template>
                    </p>
                    <p v-if="!isRecommended && assessment && !assessment.fits" class="text-amber-400/90 text-xs mt-1">
                        <i class="bi bi-exclamation-triangle"></i>
                        Déconseillé ici ({{ assessment.blockers.join(', ') }}).
                        <button class="underline hover:text-amber-300" @click="useRecommended">
                            Utiliser {{ recommendation?.model.name }}
                        </button>
                    </p>
                </div>
                <button @click="start" class="primary flex items-center gap-2 shrink-0">
                    <i class="bi" :class="isCached ? 'bi-play-fill' : 'bi-cloud-arrow-down-fill'"></i>
                    <template v-if="isCached">Charger</template>
                    <template v-else-if="isPartial">Reprendre</template>
                    <template v-else>Télécharger{{ sizeLabel ? ` (${sizeLabel})` : '' }}</template>
                </button>
            </div>
        </template>

        <div v-else class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-xs text-(--text)/60 gap-3">
                <span class="flex items-center gap-2 min-w-0">
                    <i class="bi text-(--primary)"
                        :class="status === 'downloading' ? 'bi-cloud-arrow-down animate-bounce' : 'bi-gpu-card animate-pulse'"></i>
                    <span class="truncate">
                        <template v-if="status === 'downloading'">
                            Téléchargement de {{ model?.name }} · {{ formatBytes(localLLM.downloadedBytes.value) }} / {{ formatBytes(localLLM.totalBytes.value) }}
                            <template v-if="speedLabel"> · {{ speedLabel }}</template>
                            <template v-if="etaLabel"> · {{ etaLabel }}</template>
                        </template>
                        <template v-else>Chargement de {{ model?.name }} dans la carte graphique…</template>
                    </span>
                </span>
                <span class="flex items-center gap-3 shrink-0">
                    <span class="font-mono">{{ localLLM.progress.value }}%</span>
                    <button v-if="status === 'downloading'" @click="localLLM.unload()"
                        class="text-(--text2) hover:text-red-400 transition-colors" title="Mettre en pause">
                        <i class="bi bi-pause-circle text-base"></i>
                    </button>
                </span>
            </div>
            <div class="w-full h-1.5 bg-(--text)/10 rounded-full overflow-hidden">
                <div class="h-full transition-all duration-300 bg-(--primary)" :style="{ width: localLLM.progress.value + '%' }"></div>
            </div>
            <p class="text-[11px] text-(--text)/40">
                <template v-if="status === 'downloading'">
                    Vous pouvez continuer à utiliser Synco : le téléchargement se poursuit en arrière-plan et reprendra là où il
                    s'est arrêté en cas d'interruption.
                </template>
                <template v-else>Vous pouvez déjà écrire votre message, il partira dès que le modèle sera prêt.</template>
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { localLLM } from '@/services/LocalLLMService';
import { formatBytes } from '@/services/localLLM/catalog';

const status = localLLM.status;
const profile = localLLM.profile;
const recommendation = localLLM.recommendation;
const model = localLLM.selectedModel;
const assessment = localLLM.selectedAssessment;

const isCached = computed(() => !!localLLM.cacheStatus.value?.complete);
const isPartial = computed(() => !isCached.value && (localLLM.cacheStatus.value?.cachedBytes ?? 0) > 0);
const partialPercent = computed(() => {
    const c = localLLM.cacheStatus.value;
    return c?.totalBytes ? Math.floor((c.cachedBytes / c.totalBytes) * 100) : 0;
});
const isRecommended = computed(() => recommendation.value?.model.id === model.value?.id);

const sizeLabel = computed(() => {
    const exact = localLLM.exactSizeBytes.value;
    const remaining = exact !== null ? exact - (localLLM.cacheStatus.value?.cachedBytes ?? 0) : null;
    if (remaining !== null) return formatBytes(remaining);
    const variant = model.value?.variants[profile.value?.shaderF16 ? 'f16' : 'f32'];
    return variant ? `≈ ${formatBytes(variant.approxBytes)}` : '';
});

const speedLabel = computed(() => {
    const bps = localLLM.bytesPerSec.value;
    return bps > 0 ? `${formatBytes(bps)}/s` : '';
});

const etaLabel = computed(() => {
    const bps = localLLM.bytesPerSec.value;
    const left = localLLM.totalBytes.value - localLLM.downloadedBytes.value;
    if (bps <= 0 || left <= 0) return '';
    const s = left / bps;
    if (s < 60) return 'moins d’une minute';
    if (s < 3600) return `≈ ${Math.ceil(s / 60)} min restantes`;
    return `≈ ${Math.floor(s / 3600)} h ${Math.ceil((s % 3600) / 60)} min restantes`;
});

const errorTitle = computed(() => {
    switch (localLLM.error.value?.kind) {
        case 'network': return 'Téléchargement interrompu';
        case 'gpu-memory': return 'Mémoire graphique insuffisante';
        default: return "Erreur d'initialisation";
    }
});

const start = () => localLLM.load().catch(() => { /* erreur affichée via localLLM.error */ });

const useRecommended = () => {
    if (recommendation.value) localLLM.select(recommendation.value.model.id);
};
</script>
