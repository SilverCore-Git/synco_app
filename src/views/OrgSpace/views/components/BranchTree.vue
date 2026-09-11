<template>

    <div class="w-full overflow-x-auto rounded-2xl border border-(--white)/10 bg-(--white)/5 p-4">

        <div v-if="!defaultBranch" class="py-10 text-center text-(--text2) text-sm">
            <i class="bi bi-diagram-2 text-2xl block mb-2 opacity-50" />
            Aucune branche par défaut détectée — synchronisez la connexion pour construire l'arborescence.
        </div>

        <svg
            v-else
            :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
            :width="svgWidth"
            :height="svgHeight"
            class="min-w-full"
            style="min-width: 640px;"
        >
            <!-- Tronc : branche par défaut -->
            <line
                :x1="marginX" :y1="trunkY" :x2="marginX + trunkWidth" :y2="trunkY"
                stroke="var(--primary)" stroke-width="3" stroke-linecap="round"
            />

            <!-- Pointe du tronc -->
            <circle :cx="marginX + trunkWidth" :cy="trunkY" r="6" fill="var(--primary)" />

            <text :x="marginX" :y="trunkY - 14" font-size="12" font-weight="700" fill="var(--text)">
                {{ defaultBranch.name }}
                <title>Branche par défaut</title>
            </text>
            <text :x="marginX + trunkWidth + 12" :y="trunkY + 4" font-size="10" fill="var(--text2)">
                HEAD
            </text>

            <!-- Branches dérivées -->
            <g v-for="node in nodes" :key="node.branch.id">

                <!-- Ligne divergente (du point de fork jusqu'au nœud) -->
                <path
                    :d="`M ${node.forkX} ${trunkY} L ${node.x} ${node.y}`"
                    fill="none"
                    :stroke="node.color"
                    stroke-width="2"
                    stroke-linecap="round"
                    opacity="0.85"
                />

                <!-- Point de fork sur le tronc -->
                <circle :cx="node.forkX" :cy="trunkY" r="3" fill="var(--text2)" />

                <!-- Nœud de la branche -->
                <circle :cx="node.x" :cy="node.y" r="6" :fill="node.color" />

                <!-- Label : nom de branche -->
                <text
                    :x="node.x + 10"
                    :y="node.y + (node.side === -1 ? -8 : 16)"
                    font-size="12"
                    font-weight="600"
                    fill="var(--text)"
                >
                    {{ node.branch.name }}
                </text>

                <!-- Badge ahead/behind -->
                <text
                    :x="node.x + 10"
                    :y="node.y + (node.side === -1 ? -8 : 16) + 14"
                    font-size="10"
                    font-family="monospace"
                    fill="var(--text2)"
                >
                    {{ node.aheadBehindLabel }}
                </text>

                <title>{{ node.tooltip }}</title>

            </g>

        </svg>

        <!-- Légende -->
        <div class="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-(--white)/10">
            <div v-for="status in ALL_REPO_STATUSES" :key="status" class="flex items-center gap-1.5 text-xs text-(--text2)">
                <span class="w-2.5 h-2.5 rounded-full" :style="{ background: REPO_STATUS_META[status].hex }" />
                {{ REPO_STATUS_META[status].label }}
            </div>
        </div>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { Branch } from '@/types/repos';
import { REPO_STATUS_META, ALL_REPO_STATUSES } from './RepoStatusPill.vue';

const props = defineProps<{
    branches: Branch[];
}>();

// ============================================
// Géométrie
// ============================================
// Le tronc horizontal représente la branche par défaut. Chaque autre
// branche part d'un point de fork positionné le long du tronc (ordonné par
// forkPointDate, ou par forkPointSha si la date est absente) et se termine
// sur un nœud coloré par son statut organisationnel. Les branches sont
// réparties uniformément sur l'axe X et étagées verticalement (alternance
// au-dessus/en-dessous + paliers) pour limiter les chevauchements quand
// plusieurs branches partagent un fork point proche.

const ROW_HEIGHT = 42;
const MAX_LEVELS = 3;
const marginX = 70;
const marginRight = 140;
const trunkWidth = 640;

const defaultBranch = computed(() => props.branches.find(b => b.isDefault) || null);

const otherBranches = computed(() => props.branches.filter(b => !b.isDefault));

// Tri : forkPointDate croissant d'abord, puis forkPointSha pour les branches
// sans date (regroupées après, ordre déterministe).
const sortedBranches = computed(() => {
    const withDate = otherBranches.value.filter(b => !!b.forkPointDate);
    const withoutDate = otherBranches.value.filter(b => !b.forkPointDate);

    withDate.sort((a, b) => new Date(a.forkPointDate!).getTime() - new Date(b.forkPointDate!).getTime());
    withoutDate.sort((a, b) => (a.forkPointSha || '').localeCompare(b.forkPointSha || ''));

    return [...withDate, ...withoutDate];
});

function formatAheadBehind(branch: Branch): string {
    const ahead = branch.aheadCount;
    const behind = branch.behindCount;
    if (ahead == null && behind == null) return '—';
    return `+${ahead ?? 0} / -${behind ?? 0}`;
}

function formatTooltip(branch: Branch): string {
    const parts = [branch.name];
    if (branch.lastCommitAuthor) parts.push(`Auteur : ${branch.lastCommitAuthor}`);
    if (branch.lastCommitDate) parts.push(`Dernier commit : ${new Date(branch.lastCommitDate).toLocaleString('fr-FR')}`);
    if (branch.lastCommitMessage) parts.push(branch.lastCommitMessage);
    parts.push(formatAheadBehind(branch));
    return parts.join('\n');
}

const nodes = computed(() => {
    const list = sortedBranches.value;
    const n = list.length;

    return list.map((branch, i) => {
        const forkX = marginX + ((i + 1) / (n + 1)) * trunkWidth;
        const side = i % 2 === 0 ? -1 : 1;
        const level = (Math.floor(i / 2) % MAX_LEVELS) + 1;
        const y = trunkY.value + side * level * ROW_HEIGHT;
        const x = forkX + 36;

        return {
            branch,
            forkX,
            x,
            y,
            side,
            color: REPO_STATUS_META[branch.status].hex,
            aheadBehindLabel: formatAheadBehind(branch),
            tooltip: formatTooltip(branch)
        };
    });
});

const maxLevelUsed = computed(() => {
    const n = otherBranches.value.length;
    if (n === 0) return 1;
    return Math.min(Math.ceil(n / 2), MAX_LEVELS);
});

const svgWidth = computed(() => marginX + trunkWidth + marginRight);
const svgHeight = computed(() => (maxLevelUsed.value * ROW_HEIGHT * 2) + 80);
const trunkY = computed(() => svgHeight.value / 2);

</script>
