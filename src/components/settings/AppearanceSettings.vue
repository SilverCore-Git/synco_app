<template>

    <div class="space-y-10 max-w-3xl">

        <div>
            <h3 class="text-2xl font-black text-(--text) mb-1">Apparence</h3>
            <p class="text-sm text-(--text2)">Le thème, les animations et ce que Synco montre de vous à l'écran.</p>
        </div>

        <!-- THÈME : chaque carte dessine Synco dans ce thème, avec ses vraies couleurs. -->
        <section class="space-y-4" aria-labelledby="appearance-theme">
            <div class="flex items-baseline justify-between gap-4 flex-wrap">
                <h4 id="appearance-theme" class="text-base font-bold text-(--text)">Thème</h4>
                <p class="text-sm text-(--text2)">
                    Affiché en ce moment : <span class="text-(--text) font-semibold">{{ resolvedTheme === 'dark' ? 'sombre' : 'clair' }}</span>
                </p>
            </div>

            <div role="radiogroup" aria-labelledby="appearance-theme" class="grid grid-cols-3 gap-2 sm:gap-4">
                <button
                    v-for="option in themeOptions"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :aria-checked="theme === option.value"
                    class="theme-card"
                    :class="{ selected: theme === option.value }"
                    @click="theme = option.value"
                >
                    <span class="theme-preview" :class="`preview-${option.value}`" aria-hidden="true">
                        <span v-for="half in option.halves" :key="half" class="preview-half" :class="half">
                            <span class="mini-rail">
                                <span class="mini-org active" />
                                <span class="mini-org" />
                                <span class="mini-org" />
                            </span>
                            <span class="mini-side">
                                <span class="mini-line w-3/4" />
                                <span class="mini-line mini-line-active w-2/3" />
                                <span class="mini-line w-1/2" />
                                <span class="mini-line w-2/3" />
                            </span>
                            <span class="mini-chat">
                                <span class="mini-msg">
                                    <span class="mini-avatar" />
                                    <span class="flex-1 space-y-1">
                                        <span class="mini-line w-1/3 strong" />
                                        <span class="mini-line w-5/6" />
                                    </span>
                                </span>
                                <span class="mini-msg">
                                    <span class="mini-avatar accent" />
                                    <span class="flex-1 space-y-1">
                                        <span class="mini-line w-1/4 strong" />
                                        <span class="mini-line w-2/3" />
                                    </span>
                                </span>
                                <span class="mini-input"><span class="mini-send" /></span>
                            </span>
                        </span>
                    </span>

                    <span class="flex items-center justify-between gap-2 w-full px-1">
                        <span class="text-left">
                            <span class="block font-bold text-(--text)">{{ option.label }}</span>
                            <span class="hidden sm:block text-xs text-(--text2) mt-0.5">{{ option.hint }}</span>
                        </span>
                        <span class="check" aria-hidden="true">
                            <i class="bi bi-check-lg" />
                        </span>
                    </span>
                </button>
            </div>
        </section>

        <!-- AFFICHAGE -->
        <section class="space-y-4" aria-labelledby="appearance-display">
            <h4 id="appearance-display" class="text-base font-bold text-(--text)">Affichage</h4>

            <div class="settings-panel">
                <SettingToggleRow
                    :model-value="animations !== false"
                    @update:model-value="animations = $event"
                    icon="bi bi-stars"
                    title="Animations"
                    description="Ouverture, réduction et fermeture fluides des fenêtres et des menus."
                    :disabled="systemReduced"
                >
                    <template v-if="systemReduced" #extra>
                        <p class="text-sm text-amber-500 flex items-start gap-2">
                            <i class="bi bi-info-circle-fill mt-0.5" aria-hidden="true" />
                            Votre système demande de réduire les animations : elles restent coupées tant que ce réglage y est actif.
                        </p>
                    </template>
                </SettingToggleRow>

                <SettingToggleRow
                    v-model="privacyMode"
                    icon="bi bi-incognito"
                    title="Mode confidentialité"
                    description="Ne montre que l'initiale des noms, pratique pour partager son écran."
                >
                    <template #extra>
                        <div class="privacy-preview" aria-live="polite">
                            <img :src="user?.avatarUrl || defaultAvatar(displayName)" alt="" class="w-7 h-7 rounded-full object-cover shrink-0" />
                            <span class="font-bold text-(--text) shrink-0">{{ privacyMode ? initialOf(displayName) : displayName }}</span>
                            <span class="text-xs text-(--text2)">{{ privacyMode ? 'tel que les autres noms apparaissent maintenant' : 'activez pour voir le rendu' }}</span>
                        </div>
                    </template>
                </SettingToggleRow>
            </div>
        </section>

        <!-- INTÉGRATIONS (application de bureau seulement) -->
        <section v-if="discordPresenceAvailable" class="space-y-4" aria-labelledby="appearance-integrations">
            <h4 id="appearance-integrations" class="text-base font-bold text-(--text)">Intégrations</h4>
            <div class="settings-panel">
                <SettingToggleRow
                    v-model="discordPresence"
                    icon="bi bi-discord"
                    title="Statut Discord"
                    description="Affiche « Sur Synco » ou « En appel vocal » sur votre profil Discord, sans jamais nommer l'organisation ni le salon."
                />
            </div>
        </section>

        <!-- AVANCÉ -->
        <section class="space-y-4" aria-labelledby="appearance-advanced">
            <h4 id="appearance-advanced" class="text-base font-bold text-(--text)">Avancé</h4>
            <div class="settings-panel">
                <SettingToggleRow
                    v-model="devMode"
                    icon="bi bi-code-slash"
                    title="Mode développeur"
                    description="Affiche les identifiants techniques et les options avancées dans les menus."
                />
            </div>
        </section>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import useTheme, { type ThemeSetting } from '@/composables/useTheme';
import useMotion from '@/composables/useMotion';
import useSettingsItem from '@/composables/useSettingsItem';
import { discordPresenceAvailable, useDiscordPresenceSetting } from '@/composables/useDiscordPresence';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { user } from '@/assets/var';
import SettingToggleRow from './SettingToggleRow.vue';

const { theme, resolvedTheme } = useTheme();
const { animations, systemReduced } = useMotion();
const { Item: devMode } = useSettingsItem('devMode', false);
const { Item: privacyMode } = useSettingsItem('privacyMode', false);
const discordPresence = useDiscordPresenceSetting();

const themeOptions: { value: ThemeSetting; label: string; hint: string; halves: string[] }[] = [
    { value: 'auto', label: 'Auto', hint: 'Suit le réglage du système', halves: ['dark', 'light'] },
    { value: 'dark', label: 'Sombre', hint: 'Fond noir, vert Synco', halves: ['dark'] },
    { value: 'light', label: 'Clair', hint: 'Fond blanc, lisible en plein jour', halves: ['light'] },
];

const displayName = computed(() => user.value?.name || `${user.value?.firstName ?? ''} ${user.value?.lastName ?? ''}`.trim() || 'Vous');
const initialOf = (name: string) => name.charAt(0).toUpperCase();

</script>

<style scoped>

.settings-panel {
    background: var(--bg2);
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    overflow: hidden;
}

/* --- Cartes de thème --- */
.theme-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 10px 14px;
    border-radius: 1rem;
    border: 2px solid var(--border-color);
    background: var(--bg2);
    cursor: pointer;
    transition: border-color .2s ease, transform .2s ease;
}
.theme-card:hover {
    border-color: color-mix(in srgb, var(--text) 25%, transparent);
    transform: translateY(-2px);
}
.theme-card:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}
.theme-card.selected {
    border-color: var(--primary);
}

.check {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 14px;
    border: 2px solid var(--border-color);
    color: transparent;
    transition: all .2s ease;
}
.theme-card.selected .check {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
}

/* Vignette : une mini fenêtre Synco (rail des orgs, liste des salons, discussion). */
.theme-preview {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: .65rem;
    overflow: hidden;
    border: 1px solid var(--border-color);
}
.preview-half {
    position: absolute;
    inset: 0;
    display: flex;
    background: var(--p-bg);
}
/* Auto : la diagonale coupe la même fenêtre en sombre et en clair. */
.preview-auto .preview-half.light {
    clip-path: polygon(62% 0, 100% 0, 100% 100%, 38% 100%);
}

.preview-half.dark {
    --p-bg: #121214; --p-bg2: #09090a; --p-bg3: #000; --p-line: rgba(255,255,255,.16);
    --p-strong: rgba(255,255,255,.55); --p-primary: #16ac77; --p-border: rgba(255,255,255,.08);
}
.preview-half.light {
    --p-bg: #f5f8f6; --p-bg2: #ffffff; --p-bg3: #e6ece8; --p-line: rgba(15,27,21,.16);
    --p-strong: rgba(15,27,21,.6); --p-primary: #0b7a53; --p-border: rgba(15,40,28,.12);
}

.mini-rail {
    width: 13%;
    background: var(--p-bg3);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6%;
    padding-top: 8%;
}
.mini-org {
    width: 58%;
    aspect-ratio: 1;
    border-radius: 30%;
    background: var(--p-line);
}
.mini-org.active { background: var(--p-primary); }

.mini-side {
    width: 27%;
    background: var(--p-bg2);
    border-right: 1px solid var(--p-border);
    display: flex;
    flex-direction: column;
    gap: 9%;
    padding: 10% 8%;
}
.mini-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10%;
    padding: 9% 7% 7%;
}
.mini-msg {
    display: flex;
    gap: 8%;
    align-items: flex-start;
}
.mini-avatar {
    flex: none;
    width: 14%;
    aspect-ratio: 1;
    border-radius: 999px;
    background: var(--p-line);
}
.mini-avatar.accent { background: var(--p-primary); opacity: .85; }
.mini-line {
    display: block;
    height: 4px;
    border-radius: 2px;
    background: var(--p-line);
}
.mini-line.strong { background: var(--p-strong); }
.mini-line-active { background: var(--p-primary); opacity: .9; }
.mini-input {
    margin-top: auto;
    height: 14%;
    border-radius: 999px;
    background: var(--p-bg2);
    border: 1px solid var(--p-border);
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding-right: 3%;
}
.mini-send {
    height: 60%;
    aspect-ratio: 1;
    border-radius: 999px;
    background: var(--p-primary);
}

/* --- Aperçu du mode confidentialité --- */
.privacy-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: .75rem;
    background: var(--bg);
    border: 1px solid var(--border-color);
    max-width: 100%;
    width: fit-content;
}

@media (max-width: 640px) {
    .theme-card { padding: 6px 6px 10px; gap: 8px; border-radius: .85rem; }
    .check { width: 18px; height: 18px; font-size: 12px; }
}

:global(html.motion-off) .theme-card,
:global(html.motion-off) .check {
    transition: none;
}
:global(html.motion-off) .theme-card:hover {
    transform: none;
}

</style>
