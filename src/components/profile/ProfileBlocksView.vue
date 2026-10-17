<template>

    <!-- Affichage en lecture d'un profil pro (carte de profil, aperçu des
         paramètres). Les blocs arrivent déjà filtrés pour l'org courante. -->

    <div v-if="blocks.length" class="flex flex-col gap-3">

        <div v-for="block in blocks" :key="block.id">

            <h3 class="text-[11px] font-bold text-(--text2) uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <i :class="BLOCK_META[block.type].icon" class="text-[10px]" />
                {{ blockTitle(block) }}
            </h3>

            <!-- Postes -->
            <ul v-if="block.type === 'positions'" class="flex flex-col gap-1.5">
                <li v-for="item in block.items" :key="item.id" class="text-sm text-(--text)">
                    <span class="font-semibold">{{ item.title }}</span>
                    <span v-if="item.primary" class="ml-1.5 px-1.5 py-0.5 rounded bg-(--primary)/15 text-(--primary) text-[10px] font-bold uppercase tracking-wide">Principal</span>
                    <p v-if="item.team || item.since" class="text-xs text-(--text2)">
                        {{ [item.team, formatSince(item.since)].filter(Boolean).join(' · ') }}
                    </p>
                </li>
            </ul>

            <!-- Spécialités -->
            <div v-else-if="block.type === 'skills'" class="flex flex-wrap gap-1.5">
                <span
                    v-for="item in block.items"
                    :key="item.id"
                    class="flex items-center gap-1.5 px-2 py-1 rounded bg-(--bg) border border-(--border-color) text-xs font-medium text-(--text) shadow-sm"
                    :title="item.level ? levelLabel(SKILL_LEVELS, item.level) : undefined"
                >
                    {{ item.label }}
                    <span v-if="item.level" class="flex gap-0.5" aria-hidden="true">
                        <span
                            v-for="n in 3"
                            :key="n"
                            class="w-1 h-1 rounded-full"
                            :class="n <= levelRank(item.level) ? 'bg-(--primary)' : 'bg-(--text)/15'"
                        />
                    </span>
                </span>
            </div>

            <!-- Projets -->
            <ul v-else-if="block.type === 'projects'" class="flex flex-col gap-2">
                <li v-for="item in block.items" :key="item.id" class="text-sm text-(--text)">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <a v-if="isSafeUrl(item.url)" :href="item.url" target="_blank" rel="noopener noreferrer" class="font-semibold hover:text-(--primary) hover:underline">
                            {{ item.name }} <i class="bi bi-box-arrow-up-right text-[10px]" />
                        </a>
                        <span v-else class="font-semibold">{{ item.name }}</span>
                        <span v-if="item.role" class="px-1.5 py-0.5 rounded bg-(--text)/5 text-(--text2) text-[10px] font-bold uppercase tracking-wide">{{ item.role }}</span>
                    </div>
                    <p v-if="item.description" class="text-xs text-(--text2) leading-relaxed mt-0.5 whitespace-pre-line">{{ item.description }}</p>
                </li>
            </ul>

            <!-- Langues -->
            <ul v-else-if="block.type === 'languages'" class="flex flex-col gap-1">
                <li v-for="item in block.items" :key="item.id" class="text-sm text-(--text) flex justify-between gap-2">
                    <span>{{ item.label }}</span>
                    <span v-if="item.level" class="text-xs text-(--text2)">{{ levelLabel(LANGUAGE_LEVELS, item.level) }}</span>
                </li>
            </ul>

            <!-- Liens -->
            <div v-else-if="block.type === 'links'" class="flex flex-col gap-1">
                <template v-for="item in block.items" :key="item.id">
                    <a
                        v-if="isSafeUrl(item.url)"
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm text-(--primary) hover:underline flex items-center gap-1.5 truncate"
                    >
                        <i class="bi bi-link-45deg" /> {{ item.label }}
                    </a>
                </template>
            </div>

            <!-- Section libre -->
            <dl v-else-if="block.type === 'custom'" class="flex flex-col gap-1.5">
                <div v-for="item in block.items" :key="item.id">
                    <dt class="text-xs text-(--text2)">{{ item.label }}</dt>
                    <dd class="text-sm text-(--text) whitespace-pre-line">{{ item.value }}</dd>
                </div>
            </dl>

        </div>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { UserProfile } from '@/types/types';
import { BLOCK_META, LANGUAGE_LEVELS, SKILL_LEVELS, blockTitle, formatSince, isSafeUrl } from '@/assets/utils/userProfile';

const props = defineProps<{
    profile?: UserProfile | null;
}>();

const blocks = computed(() => (props.profile?.blocks || []).filter(b => b.items.length > 0));

const levelLabel = (levels: readonly { id: string; label: string }[], id: string) =>
    levels.find(l => l.id === id)?.label ?? '';

const levelRank = (level: string) => SKILL_LEVELS.findIndex(l => l.id === level) + 1;

</script>
