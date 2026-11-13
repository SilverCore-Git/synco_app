<template>

    <!-- Éditeur du profil pro : une carte par bloc, chacune avec sa portée
         (toutes mes orgs / seulement certaines). Les modifications restent
         locales jusqu'au bouton « Enregistrer » de UserSettings. -->

    <div class="flex flex-col gap-4">

        <div
            v-for="(block, index) in model.blocks"
            :key="block.id"
            class="bg-(--bg2) border border-(--border-color) rounded-xl shadow-sm"
        >

            <!-- En-tête du bloc -->
            <div class="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 border-b border-(--border-color)">

                <i :class="BLOCK_META[block.type].icon" class="text-(--primary)" />

                <input
                    v-model="block.title"
                    :placeholder="BLOCK_META[block.type].label"
                    maxlength="60"
                    class="flex-1 min-w-[8rem] bg-transparent font-bold text-(--text) placeholder:text-(--text) outline-none focus:placeholder:text-(--text2) border-b border-transparent focus:border-(--primary)"
                    title="Renommer la section"
                />

                <!-- Portée -->
                <DropDown align="right" content-iner-t-w="w-72 p-0!">
                    <template #trigger>
                        <button
                            type="button"
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors"
                            :class="block.orgIds !== null && block.orgIds.length === 0
                                ? 'border-amber-500/40 text-amber-500 bg-amber-500/10'
                                : 'border-(--border-color) text-(--text2) hover:text-(--text) hover:border-(--primary)/40'"
                            title="Qui peut voir cette section"
                        >
                            <i :class="block.orgIds === null ? 'bi bi-globe2' : 'bi bi-building'" />
                            <span class="max-w-[10rem] truncate">{{ scopeLabel(block.orgIds) }}</span>
                            <i class="bi bi-chevron-down text-[10px]" />
                        </button>
                    </template>
                    <template #content>
                        <div class="flex flex-col p-1.5 max-h-80" @click.stop>
                            <p class="px-2 pt-1 pb-2 text-[11px] text-(--text2) leading-snug">
                                Visible par les membres de :
                            </p>
                            <button type="button" class="scope-option" @click="block.orgIds = null">
                                <i class="bi" :class="block.orgIds === null ? 'bi-check-circle-fill text-(--primary)' : 'bi-circle text-(--text2)'" />
                                <span class="flex-1">Toutes mes organisations</span>
                            </button>
                            <div class="h-px bg-(--border-color) my-1" />
                            <div class="overflow-y-auto">
                                <button
                                    v-for="org in orgs"
                                    :key="org.id"
                                    type="button"
                                    class="scope-option"
                                    @click="toggleOrg(block, org.id)"
                                >
                                    <i class="bi" :class="block.orgIds?.includes(org.id) ? 'bi-check-square-fill text-(--primary)' : 'bi-square text-(--text2)'" />
                                    <img v-if="org.logo" :src="org.logo" class="w-5 h-5 rounded object-cover shrink-0" alt="" />
                                    <span class="flex-1 truncate">{{ org.name }}</span>
                                </button>
                                <p v-if="orgs.length === 0" class="px-2 py-2 text-xs text-(--text2)">Vous n'êtes membre d'aucune organisation.</p>
                            </div>
                        </div>
                    </template>
                </DropDown>

                <div class="flex items-center">
                    <button type="button" class="icon-btn" :disabled="index === 0" title="Monter" @click="move(index, -1)">
                        <i class="bi bi-arrow-up" />
                    </button>
                    <button type="button" class="icon-btn" :disabled="index === model.blocks.length - 1" title="Descendre" @click="move(index, 1)">
                        <i class="bi bi-arrow-down" />
                    </button>
                    <button type="button" class="icon-btn hover:text-red-500!" title="Supprimer la section" @click="askRemoveBlock(index)">
                        <i class="bi bi-trash3" />
                    </button>
                </div>

            </div>

            <div class="p-4 flex flex-col gap-3">

                <p class="text-xs text-(--text2) -mt-1">{{ BLOCK_META[block.type].hint }}</p>

                <!-- POSTES -->
                <template v-if="block.type === 'positions'">
                    <div v-for="(item, i) in block.items" :key="item.id" class="item-row">
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 flex-1">
                            <input v-model="item.title" class="field" placeholder="Intitulé (ex. Cheffe de projet)" maxlength="120" />
                            <input v-model="item.team" class="field" placeholder="Équipe / service (facultatif)" maxlength="120" />
                            <!-- Pas d'<input type="month"> : Firefox desktop l'affiche en
                                 champ texte libre, et la saisie arrivait telle quelle à l'API. -->
                            <div class="flex gap-1" title="Depuis (facultatif)">
                                <select
                                    class="field w-auto!"
                                    :value="sinceMonth(item.since)"
                                    :disabled="!sinceYear(item.since)"
                                    @change="item.since = buildSince(sinceYear(item.since), ($event.target as HTMLSelectElement).value)"
                                >
                                    <option value="">Mois</option>
                                    <option v-for="(m, mi) in MONTHS" :key="m" :value="String(mi + 1).padStart(2, '0')">{{ m }}</option>
                                </select>
                                <select
                                    class="field w-auto!"
                                    :value="sinceYear(item.since)"
                                    @change="item.since = buildSince(($event.target as HTMLSelectElement).value, sinceMonth(item.since))"
                                >
                                    <option value="">Depuis…</option>
                                    <option v-for="y in YEARS" :key="y" :value="String(y)">{{ y }}</option>
                                </select>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="icon-btn"
                            :class="item.primary ? 'text-(--primary)!' : ''"
                            :title="item.primary ? 'Poste principal' : 'Définir comme poste principal'"
                            @click="setPrimary(block.items, i)"
                        >
                            <i class="bi" :class="item.primary ? 'bi-star-fill' : 'bi-star'" />
                        </button>
                        <button type="button" class="icon-btn hover:text-red-500!" title="Retirer" @click="block.items.splice(i, 1)">
                            <i class="bi bi-x-lg" />
                        </button>
                    </div>
                    <p v-if="block.items.length > 1" class="text-[11px] text-(--text2) flex items-center gap-1">
                        <i class="bi bi-star-fill text-(--primary)" /> Le poste principal s'affiche sous votre nom.
                    </p>
                    <button v-if="block.items.length < MAX_ITEMS" type="button" class="add-btn" @click="addPosition(block.items)">
                        <i class="bi bi-plus-lg" /> {{ BLOCK_META.positions.addLabel }}
                    </button>
                </template>

                <!-- SPÉCIALITÉS -->
                <template v-else-if="block.type === 'skills'">
                    <div v-if="block.items.length" class="flex flex-wrap gap-1.5">
                        <span
                            v-for="(item, i) in block.items"
                            :key="item.id"
                            class="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-(--bg) border border-(--border-color) text-sm text-(--text)"
                        >
                            {{ item.label }}
                            <button
                                type="button"
                                class="flex gap-0.5 px-1 py-1 rounded hover:bg-(--text)/10"
                                :title="`Niveau : ${skillLevelLabel(item.level)} — cliquer pour changer`"
                                @click="cycleSkillLevel(item)"
                            >
                                <span
                                    v-for="n in 3"
                                    :key="n"
                                    class="w-1.5 h-1.5 rounded-full"
                                    :class="n <= skillRank(item.level) ? 'bg-(--primary)' : 'bg-(--text)/20'"
                                />
                            </button>
                            <button type="button" class="w-5 h-5 rounded flex items-center justify-center text-(--text2) hover:text-red-500 hover:bg-(--text)/10" title="Retirer" @click="block.items.splice(i, 1)">
                                <i class="bi bi-x text-sm" />
                            </button>
                        </span>
                    </div>
                    <div v-if="block.items.length < MAX_ITEMS" class="flex gap-2">
                        <input
                            v-model="skillDrafts[block.id]"
                            class="field flex-1"
                            placeholder="Ajouter une spécialité puis Entrée"
                            maxlength="60"
                            :list="`skills-${block.id}`"
                            @keydown.enter.prevent="addSkill(block)"
                        />
                        <datalist :id="`skills-${block.id}`">
                            <option v-for="s in skillSuggestions(block)" :key="s" :value="s" />
                        </datalist>
                        <button type="button" class="add-btn shrink-0" :disabled="!skillDrafts[block.id]?.trim()" @click="addSkill(block)">
                            <i class="bi bi-plus-lg" /> {{ BLOCK_META.skills.addLabel }}
                        </button>
                    </div>
                    <p class="text-[11px] text-(--text2)">Cliquez sur les points pour indiquer votre niveau. Les spécialités déjà utilisées par vos collègues sont proposées.</p>
                </template>

                <!-- PROJETS -->
                <template v-else-if="block.type === 'projects'">
                    <div v-for="(item, i) in block.items" :key="item.id" class="item-row items-start!">
                        <div class="flex flex-col gap-2 flex-1">
                            <div class="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-2">
                                <input v-model="item.name" class="field" placeholder="Nom du projet ou du périmètre" maxlength="120" />
                                <input v-model="item.role" class="field" placeholder="Rôle" maxlength="120" list="profile-project-roles" />
                            </div>
                            <input v-model="item.url" class="field" placeholder="Lien (facultatif)" maxlength="500" @blur="item.url = normalizeUrl(item.url || '')" />
                            <textarea v-model="item.description" class="field resize-none" rows="2" placeholder="Description (facultatif)" maxlength="500" />
                        </div>
                        <button type="button" class="icon-btn hover:text-red-500!" title="Retirer" @click="block.items.splice(i, 1)">
                            <i class="bi bi-x-lg" />
                        </button>
                    </div>
                    <button v-if="block.items.length < MAX_ITEMS" type="button" class="add-btn" @click="block.items.push({ id: newId(), name: '', role: 'Responsable' })">
                        <i class="bi bi-plus-lg" /> {{ BLOCK_META.projects.addLabel }}
                    </button>
                </template>

                <!-- LANGUES -->
                <template v-else-if="block.type === 'languages'">
                    <div v-for="(item, i) in block.items" :key="item.id" class="item-row">
                        <div class="grid grid-cols-[1fr_10rem] gap-2 flex-1">
                            <input v-model="item.label" class="field" placeholder="Langue" maxlength="60" />
                            <select v-model="item.level" class="field">
                                <option :value="undefined">Niveau…</option>
                                <option v-for="l in LANGUAGE_LEVELS" :key="l.id" :value="l.id">{{ l.label }}</option>
                            </select>
                        </div>
                        <button type="button" class="icon-btn hover:text-red-500!" title="Retirer" @click="block.items.splice(i, 1)">
                            <i class="bi bi-x-lg" />
                        </button>
                    </div>
                    <button v-if="block.items.length < MAX_ITEMS" type="button" class="add-btn" @click="block.items.push({ id: newId(), label: '', level: 'courant' })">
                        <i class="bi bi-plus-lg" /> {{ BLOCK_META.languages.addLabel }}
                    </button>
                </template>

                <!-- LIENS -->
                <template v-else-if="block.type === 'links'">
                    <div v-for="(item, i) in block.items" :key="item.id" class="item-row">
                        <!-- Icône : choisie, ou déduite de l'URL tant qu'on n'a rien choisi -->
                        <DropDown align="left" content-iner-t-w="w-72">
                            <template #trigger>
                                <button
                                    type="button"
                                    class="w-10 h-[38px] shrink-0 rounded-lg border flex items-center justify-center transition-colors"
                                    :class="item.icon ? 'border-(--primary)/50 text-(--primary) bg-(--primary)/10' : 'border-(--border-color) text-(--text2) bg-(--bg) hover:text-(--text)'"
                                    :title="item.icon ? 'Changer l\'icône' : 'Choisir une icône (sinon déduite du lien)'"
                                >
                                    <i :class="linkIconClass(item)" />
                                </button>
                            </template>
                            <template #content>
                                <p class="px-2 pt-1 pb-2 text-[11px] text-(--text2)">Icône du lien</p>
                                <div class="grid grid-cols-6 gap-1 px-1 pb-1">
                                    <button
                                        v-for="choice in LINK_ICON_CHOICES"
                                        :key="choice.id"
                                        type="button"
                                        class="aspect-square rounded-lg flex items-center justify-center text-base transition-colors"
                                        :class="item.icon === choice.id ? 'bg-(--primary) text-white' : 'text-(--text) hover:bg-(--primary)/15'"
                                        :title="choice.label"
                                        @click="item.icon = choice.id"
                                    >
                                        <i :class="`bi bi-${choice.id}`" />
                                    </button>
                                </div>
                                <button
                                    v-if="item.icon"
                                    type="button"
                                    class="w-full mt-1 px-2 py-1.5 rounded-lg text-xs text-left text-(--text2) hover:bg-(--text)/10"
                                    @click="item.icon = undefined"
                                >
                                    <i class="bi bi-magic" /> Automatique (selon le lien)
                                </button>
                            </template>
                        </DropDown>
                        <div class="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-2 flex-1 ml-1">
                            <input v-model="item.label" class="field" placeholder="Texte au survol (ex. Mon GitHub)" maxlength="60" />
                            <input v-model="item.url" class="field" placeholder="https://…" maxlength="500" @blur="item.url = normalizeUrl(item.url)" />
                        </div>
                        <button type="button" class="icon-btn hover:text-red-500!" title="Retirer" @click="block.items.splice(i, 1)">
                            <i class="bi bi-x-lg" />
                        </button>
                    </div>
                    <button v-if="block.items.length < MAX_ITEMS" type="button" class="add-btn" @click="block.items.push({ id: newId(), label: '', url: '' })">
                        <i class="bi bi-plus-lg" /> {{ BLOCK_META.links.addLabel }}
                    </button>
                </template>

                <!-- SECTION LIBRE -->
                <template v-else-if="block.type === 'custom'">
                    <div v-for="(item, i) in block.items" :key="item.id" class="item-row items-start!">
                        <div class="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-2 flex-1">
                            <input v-model="item.label" class="field" placeholder="Intitulé (ex. Bureau)" maxlength="60" />
                            <textarea v-model="item.value" class="field resize-none" rows="1" placeholder="Valeur" maxlength="500" />
                        </div>
                        <button type="button" class="icon-btn hover:text-red-500!" title="Retirer" @click="block.items.splice(i, 1)">
                            <i class="bi bi-x-lg" />
                        </button>
                    </div>
                    <button v-if="block.items.length < MAX_ITEMS" type="button" class="add-btn" @click="block.items.push({ id: newId(), label: '', value: '' })">
                        <i class="bi bi-plus-lg" /> {{ BLOCK_META.custom.addLabel }}
                    </button>
                </template>

            </div>

        </div>

        <datalist id="profile-project-roles">
            <option v-for="r in PROJECT_ROLES" :key="r" :value="r" />
        </datalist>

        <!-- Ajouter une section -->
        <DropDown v-if="model.blocks.length < MAX_BLOCKS" align="left" content-iner-t-w="w-80">
            <template #trigger>
                <button type="button" class="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-(--border-color) text-sm font-semibold text-(--text2) hover:text-(--primary) hover:border-(--primary)/50 transition-colors">
                    <i class="bi bi-plus-circle" /> Ajouter une section
                </button>
            </template>
            <template #content>
                <button
                    v-for="type in BLOCK_ORDER"
                    :key="type"
                    type="button"
                    class="w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left hover:bg-(--primary)/10 transition-colors"
                    @click="addBlock(type)"
                >
                    <i :class="BLOCK_META[type].icon" class="text-(--primary) mt-0.5" />
                    <span class="flex flex-col">
                        <span class="text-sm font-semibold text-(--text)">
                            {{ BLOCK_META[type].label }}
                            <span v-if="hasType(type) && type !== 'custom' && type !== 'positions'" class="text-[10px] font-normal text-(--text2)">· déjà présente</span>
                        </span>
                        <span class="text-xs text-(--text2) leading-snug">{{ BLOCK_META[type].hint }}</span>
                    </span>
                </button>
            </template>
        </DropDown>
        <p v-else class="text-xs text-(--text2) text-center">Limite de {{ MAX_BLOCKS }} sections atteinte.</p>

    </div>

    <ConfirmDelete
        :show="blockToRemove !== null"
        :itemName="blockToRemove !== null && model.blocks[blockToRemove] ? blockTitle(model.blocks[blockToRemove]!) : ''"
        itemType="la section"
        buttonText="Retirer la section"
        message="La section et son contenu seront retirés de votre profil à l'enregistrement."
        @confirm="removeBlock"
        @cancel="blockToRemove = null"
    />

</template>

<script setup lang="ts">

import { computed, reactive, ref } from 'vue';
import DropDown from '@/components/DropDown.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import type { ProfileBlock, ProfileBlockType, ProfilePositionItem, ProfileSkillItem, UserProfile } from '@/types/types';
import { organizations, openedOrg } from '@/assets/var';
import {
    BLOCK_META, BLOCK_ORDER, LANGUAGE_LEVELS, MAX_BLOCKS, MAX_ITEMS, PROJECT_ROLES, SKILL_LEVELS,
    LINK_ICON_CHOICES, blockTitle, cleanProfile, linkIconClass, newBlock, newId, normalizeUrl,
} from '@/assets/utils/userProfile';

const model = defineModel<UserProfile>({ required: true });

const orgs = computed(() => (organizations.value || []).map((o: any) => ({ id: o.id as string, name: o.name as string, logo: o.logo as string | null })));

const scopeLabel = (orgIds: string[] | null) => {
    if (orgIds === null) return 'Toutes mes organisations';
    const known = orgIds.filter(id => orgs.value.some(o => o.id === id));
    if (known.length === 0) return 'Visible par personne';
    if (known.length === 1) return orgs.value.find(o => o.id === known[0])!.name;
    return `${known.length} organisations`;
};

const toggleOrg = (block: ProfileBlock, orgId: string) => {
    // Depuis « toutes mes orgs », cocher une org restreint la section à celle-ci.
    if (block.orgIds === null) {
        block.orgIds = [orgId];
        return;
    }
    const i = block.orgIds.indexOf(orgId);
    if (i === -1) block.orgIds.push(orgId);
    else block.orgIds.splice(i, 1);
};

const hasType = (type: ProfileBlockType) => model.value.blocks.some(b => b.type === type);

const addBlock = (type: ProfileBlockType) => {
    const block = newBlock(type);
    // Une section vide n'est jamais enregistrée (cleanProfile) : on l'amorce
    // avec une première ligne à remplir plutôt qu'une carte vide.
    switch (block.type) {
        case 'positions':
            // Un poste ajouté depuis une org ouverte la concerne en général seule.
            if (openedOrg.value) block.orgIds = [openedOrg.value.id];
            addPosition(block.items);
            break;
        case 'projects':
            if (openedOrg.value) block.orgIds = [openedOrg.value.id];
            block.items.push({ id: newId(), name: '', role: 'Responsable' });
            break;
        case 'languages': block.items.push({ id: newId(), label: '', level: 'courant' }); break;
        case 'links': block.items.push({ id: newId(), label: '', url: '' }); break;
        case 'custom': block.items.push({ id: newId(), label: '', value: '' }); break;
        case 'skills': break;
    }
    model.value.blocks.push(block);
};

const move = (index: number, delta: number) => {
    const blocks = model.value.blocks;
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
};

const blockToRemove = ref<number | null>(null);

const askRemoveBlock = (index: number) => {
    const block = model.value.blocks[index];
    if (!block) return;
    // Rien de saisi : pas la peine de demander confirmation.
    const hasContent = cleanProfile({ version: 1, blocks: [block] }).blocks.length > 0;
    if (hasContent) blockToRemove.value = index;
    else model.value.blocks.splice(index, 1);
};

const removeBlock = () => {
    if (blockToRemove.value !== null) model.value.blocks.splice(blockToRemove.value, 1);
    blockToRemove.value = null;
};

// --- Postes
const addPosition = (items: ProfilePositionItem[]) => {
    items.push({ id: newId(), title: '', primary: items.length === 0 && !hasPrimaryPosition() });
};

const hasPrimaryPosition = () => model.value.blocks.some(b => b.type === 'positions' && b.items.some(i => i.primary));

// Un seul poste principal sur tout le profil, toutes sections confondues.
const setPrimary = (items: ProfilePositionItem[], index: number) => {
    const wasPrimary = items[index]?.primary;
    for (const b of model.value.blocks) {
        if (b.type === 'positions') b.items.forEach(i => { i.primary = false; });
    }
    if (!wasPrimary && items[index]) items[index].primary = true;
};

// « Depuis » : AAAA ou AAAA-MM, le format attendu par l'API.
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const YEARS = Array.from({ length: 60 }, (_, i) => new Date().getFullYear() - i);
const sinceYear = (since?: string) => (since && /^\d{4}/.test(since) ? since.slice(0, 4) : '');
const sinceMonth = (since?: string) => (since && /^\d{4}-\d{2}$/.test(since) ? since.slice(5, 7) : '');
const buildSince = (year: string, month: string) => (year ? (month ? `${year}-${month}` : year) : undefined);

// --- Spécialités
const skillDrafts = reactive<Record<string, string>>({});

const addSkill = (block: ProfileBlock) => {
    if (block.type !== 'skills') return;
    const label = (skillDrafts[block.id] || '').trim().slice(0, 60);
    if (!label) return;
    if (!block.items.some(i => i.label.toLowerCase() === label.toLowerCase())) {
        block.items.push({ id: newId(), label });
    }
    skillDrafts[block.id] = '';
};

const skillRank = (level?: ProfileSkillItem['level']) => SKILL_LEVELS.findIndex(l => l.id === level) + 1;
const skillLevelLabel = (level?: ProfileSkillItem['level']) => SKILL_LEVELS.find(l => l.id === level)?.label ?? 'non précisé';

const cycleSkillLevel = (item: ProfileSkillItem) => {
    const next = skillRank(item.level); // rang 0..3 → index du niveau suivant
    item.level = next < SKILL_LEVELS.length ? SKILL_LEVELS[next]!.id : undefined;
};

// Suggestions : spécialités déjà saisies par les membres de l'org ouverte,
// pour éviter « Vue », « VueJS » et « vue.js » côte à côte.
const orgSkills = computed(() => {
    const set = new Map<string, string>();
    for (const m of openedOrg.value?.members || []) {
        for (const b of m.user?.profile?.blocks || []) {
            if (b.type !== 'skills') continue;
            for (const s of b.items) {
                const key = s.label.toLowerCase();
                if (!set.has(key)) set.set(key, s.label);
            }
        }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'fr'));
});

const skillSuggestions = (block: ProfileBlock) => {
    if (block.type !== 'skills') return [];
    const taken = new Set(block.items.map(i => i.label.toLowerCase()));
    return orgSkills.value.filter(s => !taken.has(s.toLowerCase()));
};

</script>

<style scoped>
@reference "@/style.css";

.field {
    @apply w-full bg-(--bg) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) placeholder:text-(--text2)/70 focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all;
}

.item-row {
    @apply flex items-center gap-1;
}

.icon-btn {
    @apply w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-(--text2) hover:text-(--text) hover:bg-(--text)/10 transition-colors disabled:opacity-30 disabled:pointer-events-none;
}

.add-btn {
    @apply self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-(--primary) hover:bg-(--primary)/10 transition-colors disabled:opacity-40 disabled:pointer-events-none;
}

.scope-option {
    @apply w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left text-(--text) hover:bg-(--primary)/10 transition-colors;
}
</style>
