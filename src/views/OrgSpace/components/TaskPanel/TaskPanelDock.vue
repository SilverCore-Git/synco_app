<template>
    <!-- Bureau : entrées réduites en colonne, puis les entrées dépliées au plus
         près du bas (côte à côte s'il y en a plusieurs), toutes sur la même largeur. Monté dans la colonne bas-droite
         d'App.vue, au-dessus de l'overlay des transferts : tout s'empile dans
         la hauteur. Toujours rendu (même vide) pour que les animations
         d'ouverture et de fermeture aient un parent stable. -->
    <div v-if="!isLittleScreen" ref="dockEl" class="task-dock">
        <!-- Tout fermer : dès deux entrées (une seule a déjà sa croix). Un
             brouillon de tâche commencé demande une confirmation sur place. -->
        <Transition name="close-all">
            <button
                v-if="panels.length >= 2"
                type="button"
                class="close-all"
                :class="{ 'is-confirm': confirmCloseAll }"
                :title="confirmCloseAll ? 'Les brouillons non enregistrés seront perdus' : 'Tout fermer (Maj+Échap)'"
                @click="onCloseAllClick"
            >
                <template v-if="confirmCloseAll">
                    <i class="bi bi-exclamation-triangle"></i> Brouillon perdu — confirmer
                </template>
                <template v-else>
                    <span class="text-(--text2) font-medium">{{ panels.length }} ouverts</span>
                    <span class="close-all-sep"></span>
                    <i class="bi bi-x-lg text-[10px]"></i> Tout fermer
                </template>
            </button>
        </Transition>
        <div v-if="minimizedPanels.length" class="task-bars">
            <!-- Glisser une barre vers la droite la ferme. -->
            <div
                v-for="p in minimizedPanels"
                :key="p.id"
                :data-task-id="p.id"
                data-kind="bar"
                class="task-bar br-bar touch-pan-y"
                @pointerdown="onBarPointerDown($event, p.id)"
            >
                <button
                    type="button"
                    class="flex-1 min-w-0 h-full flex items-center gap-2 pl-3 text-left"
                    :title="`Déplier : ${panelTitle(p)}`"
                    @click="onBarClick($event, p.id)"
                >
                    <i :class="panelIcon(p)" :style="panelIconStyle(p)"></i>
                    <span class="flex-1 min-w-0 truncate text-sm font-semibold" :class="p.task || p.draft?.form.title || p.event?.form.title ? 'text-(--text)' : 'text-(--text2)'">{{ panelTitle(p) }}</span>
                    <span v-if="p.task && barDue(p.task)" class="text-[11px] whitespace-nowrap" :class="isTaskOverdue(p.task) ? 'text-red-500 font-bold' : 'text-(--text2)'">{{ barDue(p.task) }}</span>
                    <span v-else-if="p.event" class="text-[11px] whitespace-nowrap text-(--text2)">{{ eventBarWhen(p.event) }}</span>
                    <span v-else-if="p.draft" class="text-[11px] whitespace-nowrap text-(--text2)">Brouillon</span>
                </button>
                <button type="button" class="br-btn mr-1" :aria-label="`Fermer : ${panelTitle(p)}`" title="Fermer" @click="close(p.id)">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </div>

        <!-- Panneaux dépliés : un seul d'habitude, plusieurs côte à côte après
             un Ctrl+clic. Le plus récent est au plus près du coin. -->
        <div v-if="expandedPanels.length" class="task-panels">
            <section
                v-for="expanded in expandedPanels"
                :key="expanded.id"
                :data-task-id="expanded.id"
                data-kind="panel"
                class="task-panel br-card"
                role="dialog"
                :aria-label="panelAriaLabel(expanded)"
            >
                <!-- Tirer l'en-tête vers le bas réduit le panneau. -->
                <header
                    class="flex items-center gap-1.5 pl-4 pr-2 py-2 border-b border-(--border-color) shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
                    title="Glisser vers le bas pour réduire"
                    @pointerdown="onHeaderPointerDown($event, expanded.id)"
                >
                    <i :class="panelIcon(expanded)" :style="panelIconStyle(expanded)"></i>
                    <div v-if="expanded.task" class="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-(--text2)">
                        <span class="truncate shrink-0 max-w-[45%]">{{ spaceName(expanded.task) }}</span>
                        <template v-if="expanded.task.parentTask">
                            <i class="bi bi-chevron-right text-[9px]"></i>
                            <button
                                type="button"
                                class="truncate hover:text-(--primary) transition-colors"
                                :title="`Ouvrir la tâche parente : ${expanded.task.parentTask.title}`"
                                @click="openTaskById(orgIdOf(expanded.task), expanded.task.parentTask)"
                            >{{ expanded.task.parentTask.title }}</button>
                        </template>
                    </div>
                    <div v-else class="flex-1 min-w-0 text-xs font-semibold text-(--text)">
                        {{ headerLabel(expanded) }}
                    </div>
                    <button type="button" class="br-btn" title="Réduire" aria-label="Réduire" @click="minimizeTask(expanded.id)">
                        <i class="bi bi-dash-lg"></i>
                    </button>
                    <button type="button" class="br-btn" title="Fermer" aria-label="Fermer" @click="close(expanded.id)">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </header>
                <TaskDetails
                    v-if="expanded.task"
                    :task="expanded.task"
                    :org-id="orgIdOf(expanded.task)"
                    :edit-title="expanded.editTitle"
                    variant="panel"
                />
                <TaskCreateForm
                    v-else-if="expanded.draft"
                    :panel-id="expanded.id"
                    :draft="expanded.draft"
                    :org-id="currentOrgId"
                    variant="panel"
                />
                <EventDetails
                    v-else-if="expanded.event"
                    :panel-id="expanded.id"
                    :state="expanded.event"
                    variant="panel"
                />
            </section>
        </div>
    </div>

    <!-- Petit écran : la Popup plein écran habituelle. -->
    <Popup v-if="isLittleScreen" :is-open="!!expanded" @close="expanded && closeTask(expanded.id)">
        <template #title>
            <div class="flex flex-col gap-0.5">
                <button
                    v-if="expanded?.task?.parentTask"
                    type="button"
                    class="flex items-center gap-1 text-[11px] font-semibold text-(--text2) hover:text-(--primary) transition-colors text-left"
                    @click="openTaskById(orgIdOf(expanded.task), expanded.task.parentTask)"
                >
                    <i class="bi bi-arrow-left-short text-sm"></i> {{ expanded.task.parentTask.title }}
                </button>
                <span class="flex items-center gap-2">
                    <i :class="expanded?.event ? 'bi bi-calendar-event' : 'bi bi-check2-square'" class="text-(--primary)"></i>
                    {{ expanded?.task ? spaceName(expanded.task) : expanded ? headerLabel(expanded) : '' }}
                </span>
            </div>
        </template>
        <template v-if="expanded">
            <TaskDetails
                v-if="expanded.task"
                :key="expanded.id"
                :task="expanded.task"
                :org-id="orgIdOf(expanded.task)"
                :edit-title="expanded.editTitle"
                variant="popup"
            />
            <TaskCreateForm
                v-else-if="expanded.draft"
                :key="expanded.id"
                :panel-id="expanded.id"
                :draft="expanded.draft"
                :org-id="currentOrgId"
                variant="popup"
            />
            <EventDetails
                v-else-if="expanded.event"
                :key="expanded.id"
                :panel-id="expanded.id"
                :state="expanded.event"
                variant="popup"
            />
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Popup from '@/components/Popup.vue';
import TaskDetails from './TaskDetails.vue';
import TaskCreateForm from './TaskCreateForm.vue';
import EventDetails from './EventDetails.vue';
import type { Task } from '@/types/types';
import { isLittleScreen, openedOrg } from '@/assets/var';
import { isTaskOverdue, overdueLabel } from '@/assets/utils/taskOverdue';
import { useTaskPanels, type TaskPanel } from '@/composables/useTaskPanels';
import { transfers, dismissTransfer } from '@/services/transfers/transferManager';
import type { EventPanelState } from '@/composables/useEventPanels';
import useMotion from '@/composables/useMotion';

const route = useRoute();
const { panels, openTaskById, minimizeTask, restoreTask, closeTask, closeAllTasks } = useTaskPanels();
const { animationsEnabled } = useMotion();

const dockEl = ref<HTMLElement | null>(null);
const expandedPanels = computed(() => panels.value.filter(p => !p.minimized));
// Petit écran : une seule entrée affichée, dans la Popup (la plus récente).
const expanded = computed(() => expandedPanels.value[expandedPanels.value.length - 1] ?? null);
const minimizedPanels = computed(() => panels.value.filter(p => p.minimized));

// Les tâches et les événements appartiennent à une organisation (membres, espaces, droits) :
// en changer ferme le dock plutôt que d'afficher des listes qui ne collent plus.
watch(() => route.params.orgId, (orgId, previous) => {
    if (orgId !== previous) closeAllTasks();
});

// ── Animations ─────────────────────────────────────────────────────────
// Chaque changement du dock (ouvrir, réduire, déplier, fermer), qu'il vienne
// d'ici ou d'ailleurs (Kanban, accueil, Échap), passe par le même chemin :
// on mesure chaque tâche avant que Vue ne mette le DOM à jour, puis après,
// et on anime l'écart (technique FLIP).
//  - même forme, autre place     → glissement ;
//  - barre ↔ panneau             → une forme se déforme de l'une à l'autre
//                                  (le panneau se réduit en sa barre) ;
//  - nouvelle                    → entrée depuis le bas ;
//  - disparue                    → sortie (close() l'anime avant de retirer).

const DURATION = 340;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

interface Snapshot { rect: DOMRect; kind: string; radius: string }

const taskElements = () =>
    Array.from(dockEl.value?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []);

function snapshot(): Map<string, Snapshot> {
    const map = new Map<string, Snapshot>();
    for (const el of taskElements()) {
        map.set(el.dataset.taskId!, {
            rect: el.getBoundingClientRect(),
            kind: el.dataset.kind!,
            radius: getComputedStyle(el).borderRadius
        });
    }
    return map;
}

// Forme intermédiaire : une boîte aux couleurs du dock qui passe du rectangle
// de départ au rectangle d'arrivée, pendant que le vrai élément reste masqué.
function morph(from: Snapshot, to: DOMRect, toRadius: string): Promise<void> {
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        background: 'var(--bg)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 18px 50px rgba(0, 0, 0, 0.35)',
        zIndex: '1501',
        pointerEvents: 'none'
    });
    document.body.appendChild(ghost);
    const frame = (r: DOMRect, radius: string) => ({
        width: `${r.width}px`,
        height: `${r.height}px`,
        transform: `translate(${r.left}px, ${r.top}px)`,
        borderRadius: radius
    });
    const anim = ghost.animate([frame(from.rect, from.radius), frame(to, toRadius)], { duration: DURATION, easing: EASE });
    return anim.finished.then(() => ghost.remove(), () => ghost.remove());
}

function animateFrom(before: Map<string, Snapshot>) {
    const present = new Set(taskElements().map(el => el.dataset.taskId));
    // Le panneau déplié qui disparaît alors qu'un autre apparaît (brouillon
    // devenu tâche, autre tâche ouverte à sa place) : l'un se déforme en l'autre.
    let replacedPanel = [...before].find(([id, snap]) => snap.kind === 'panel' && !present.has(id) && !closedByHand.has(id));

    for (const el of taskElements()) {
        const id = el.dataset.taskId!;
        const kind = el.dataset.kind!;
        let prev = before.get(id);
        if (!prev && kind === 'panel' && replacedPanel) {
            prev = replacedPanel[1];
            before.delete(replacedPanel[0]);
            replacedPanel = undefined;
        }
        const rect = el.getBoundingClientRect();

        if (!prev) {
            el.style.transformOrigin = 'bottom right';
            el.animate(
                kind === 'panel'
                    ? [{ opacity: 0, transform: 'translateY(24px) scale(0.94)' }, { opacity: 1, transform: 'none' }]
                    : [{ opacity: 0, transform: 'translateY(10px) scale(0.96)' }, { opacity: 1, transform: 'none' }],
                { duration: DURATION, easing: EASE }
            );
        } else if (prev.kind !== kind || Math.abs(prev.rect.width - rect.width) > 2 || Math.abs(prev.rect.height - rect.height) > 2) {
            // Masqué pendant la déformation, puis le contenu apparaît en fondu.
            el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: DURATION });
            morph(prev, rect, getComputedStyle(el).borderRadius).then(() => {
                el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
            });
        } else {
            const dx = prev.rect.left - rect.left;
            const dy = prev.rect.top - rect.top;
            if (dx || dy) {
                el.animate(
                    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                    { duration: DURATION, easing: EASE }
                );
            }
        }
    }
    // Retirée sans passer par close() (tâche supprimée, archivée) : sa forme
    // s'efface sur place.
    for (const [id, prev] of before) {
        if (present.has(id)) continue;
        if (closedByHand.delete(id)) continue;
        fadeOut(prev);
    }
}

function fadeOut(prev: Snapshot) {
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
        position: 'fixed',
        left: `${prev.rect.left}px`,
        top: `${prev.rect.top}px`,
        width: `${prev.rect.width}px`,
        height: `${prev.rect.height}px`,
        borderRadius: prev.radius,
        background: 'var(--bg)',
        border: '1px solid var(--border-color)',
        zIndex: '1499',
        pointerEvents: 'none',
        transformOrigin: 'bottom right'
    });
    document.body.appendChild(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px) scale(0.96)' }], { duration: 220, easing: 'ease-in' })
        .finished.then(() => ghost.remove(), () => ghost.remove());
}

// Mesure avant le rendu (flush: 'pre' : le DOM est encore l'ancien), anime après.
watch(
    () => panels.value.map(p => `${p.id}:${p.minimized ? 'm' : 'e'}`).join('|'),
    () => {
        if (!animationsEnabled.value || isLittleScreen.value) return;
        const before = snapshot();
        nextTick(() => animateFrom(before));
    },
    { flush: 'pre' }
);

const closedByHand = new Set<string>();

// ── Tout fermer ────────────────────────────────────────────────────────
// Ferme toutes les entrées du dock (les tâches et événements sont déjà
// enregistrés au fil de l'eau) et range les transferts terminés ; ceux en
// cours continuent. Seul un brouillon de tâche commencé serait perdu : on
// demande alors un second clic.
const confirmCloseAll = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

const hasUnsavedDraft = () => panels.value.some(p =>
    p.draft && (p.draft.form.title.trim() || p.draft.form.description.trim() || p.draft.files.length));

function onCloseAllClick() {
    if (!confirmCloseAll.value && hasUnsavedDraft()) {
        confirmCloseAll.value = true;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirmCloseAll.value = false; }, 4000);
        return;
    }
    closeEverything();
}

async function closeEverything() {
    clearTimeout(confirmTimer);
    confirmCloseAll.value = false;
    transfers.filter(t => t.status === 'done' || t.status === 'error' || t.status === 'cancelled')
        .forEach(t => dismissTransfer(t.id));
    const els = taskElements();
    if (animationsEnabled.value && els.length) {
        // Toutes partent ensemble, en cascade depuis le coin.
        await Promise.all(els.reverse().map((el, i) => {
            el.style.transformOrigin = 'bottom right';
            el.style.pointerEvents = 'none';
            closedByHand.add(el.dataset.taskId!);
            return el.animate(
                [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px) scale(0.94)' }],
                { duration: 200, delay: Math.min(i, 6) * 25, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
            ).finished.catch(() => {});
        }));
    }
    closeAllTasks();
}

// Plus de brouillon commencé (ou moins de deux entrées) : on oublie la confirmation.
watch(() => panels.value.length, () => { confirmCloseAll.value = false; });

// Fermer : l'élément part d'abord (vers le bas, en rétrécissant), puis il est retiré.
async function close(taskId: string) {
    const el = dockEl.value?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    if (animationsEnabled.value && el) {
        el.style.transformOrigin = 'bottom right';
        el.style.pointerEvents = 'none';
        await el.animate(
            [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: el.dataset.kind === 'panel' ? 'translateY(20px) scale(0.94)' : 'scale(0.94)' }],
            { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
        ).finished.catch(() => {});
        closedByHand.add(taskId);
    }
    closeTask(taskId);
}

// ── Gestes ─────────────────────────────────────────────────────────────

// Tirer l'en-tête vers le bas : le panneau suit le pointeur ; relâché au-delà
// de 80 px, il se réduit (la déformation part de là où on l'a lâché).
function onHeaderPointerDown(e: PointerEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const header = e.currentTarget as HTMLElement;
    const panel = header.closest<HTMLElement>('.task-panel');
    if (!panel) return;
    const startY = e.clientY;
    let dy = 0;
    let dragging = false;

    const move = (ev: PointerEvent) => {
        dy = Math.max(0, ev.clientY - startY);
        if (!dragging && dy > 4) {
            dragging = true;
            header.setPointerCapture(ev.pointerId);
        }
        if (dragging) panel.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy / 2000, 0.04)})`;
    };
    const up = () => {
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', up);
        header.removeEventListener('pointercancel', up);
        if (!dragging) return;
        if (dy > 80) {
            minimizeTask(id);
            return;
        }
        const from = panel.style.transform;
        panel.style.transform = '';
        if (animationsEnabled.value) {
            panel.animate([{ transform: from }, { transform: 'none' }], { duration: 220, easing: EASE });
        }
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
    header.addEventListener('pointercancel', up);
}

// Glisser une barre vers la droite : relâchée au-delà de 100 px, elle part
// hors de l'écran et la tâche se ferme.
let suppressBarClick = false;

function onBarPointerDown(e: PointerEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.br-btn')) return;
    const bar = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    let dx = 0;
    let dragging = false;

    const move = (ev: PointerEvent) => {
        dx = ev.clientX - startX;
        if (!dragging && Math.abs(dx) > 6) {
            dragging = true;
            // Capture seulement une fois le glissement commencé : un simple
            // clic doit rester un clic sur le bouton (déplier).
            bar.setPointerCapture(ev.pointerId);
        }
        if (!dragging) return;
        const x = dx > 0 ? dx : dx * 0.2;
        bar.style.transform = `translateX(${x}px)`;
        bar.style.opacity = String(1 - Math.min(Math.max(x, 0) / 260, 0.75));
    };
    const up = async () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        if (!dragging) return;
        suppressBarClick = true;
        setTimeout(() => { suppressBarClick = false; });
        if (dx > 100) {
            if (animationsEnabled.value) {
                await bar.animate(
                    [{ transform: bar.style.transform, opacity: bar.style.opacity }, { transform: 'translateX(120%)', opacity: 0 }],
                    { duration: 180, easing: 'ease-in', fill: 'forwards' }
                ).finished.catch(() => {});
            }
            closedByHand.add(id);
            closeTask(id);
            return;
        }
        const from = { transform: bar.style.transform, opacity: bar.style.opacity };
        bar.style.transform = '';
        bar.style.opacity = '';
        if (animationsEnabled.value) {
            bar.animate([from, { transform: 'none', opacity: 1 }], { duration: 200, easing: EASE });
        }
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
}

function onBarClick(e: MouseEvent, id: string) {
    if (suppressBarClick) return;
    restoreTask(id, e.ctrlKey || e.metaKey);
}

// ── Échap ──────────────────────────────────────────────────────────────
// Échap réduit le panneau qui a le focus, sinon le dernier déplié, même si le
// focus est ailleurs dans l'app. Pas quand autre chose est par-dessus (Popup,
// visionneuse…) : c'est à elle de se fermer. Pas non plus pendant une saisie
// hors du dock (Échap y a déjà un sens : annuler une réponse, une mention…).
function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || !dockEl.value) return;
    const target = e.target as HTMLElement | null;
    const inDock = !!target && dockEl.value.contains(target);
    if (!inDock && target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;

    // Maj+Échap : tout fermer (mêmes règles que la pastille).
    if (e.shiftKey) {
        if (!panels.value.length || isCovered(taskElements()[0])) return;
        e.preventDefault();
        onCloseAllClick();
        return;
    }

    const focused = inDock ? target!.closest<HTMLElement>('[data-kind="panel"]')?.dataset.taskId : undefined;
    const id = focused ?? expandedPanels.value[expandedPanels.value.length - 1]?.id;
    const el = id ? dockEl.value.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`) : null;
    if (!id || !el) return;

    if (isCovered(el)) return;

    e.preventDefault();
    minimizeTask(id);
}

// Quelque chose couvre l'élément (Popup, menu…) : Échap est pour lui.
function isCovered(el: HTMLElement | undefined) {
    if (!el) return true;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
    return !!top && !el.contains(top);
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown));

// ── Affichage ──────────────────────────────────────────────────────────
const currentOrgId = computed(() => String(route.params.orgId || openedOrg.value?.id || ''));

const panelTitle = (p: TaskPanel) => {
    if (p.event) return p.event.form.title.trim() || 'Nouvel événement';
    return p.task?.title ?? (p.draft?.form.title.trim() || 'Nouvelle tâche');
};

const panelIcon = (p: TaskPanel) => {
    if (p.event) return 'bi bi-calendar-event shrink-0';
    return p.task ? statusIcon(p.task) : 'bi bi-plus-circle-dotted text-(--primary) shrink-0';
};

// L'icône d'un événement prend sa couleur dans l'agenda.
const panelIconStyle = (p: TaskPanel) => p.event ? { color: p.event.form.color || 'var(--primary)' } : undefined;

const headerLabel = (p: TaskPanel) => {
    if (p.event) return p.event.eventId ? 'Agenda' : 'Nouvel événement';
    return p.draft?.parentTaskId ? 'Nouvelle sous-tâche' : 'Nouvelle tâche';
};

const panelAriaLabel = (p: TaskPanel) => {
    if (p.event) return p.event.eventId ? `Événement : ${panelTitle(p)}` : 'Nouvel événement';
    return p.task ? `Tâche : ${p.task.title}` : 'Nouvelle tâche';
};

// Barre d'un événement réduit : « 14:30 », « Demain », « jeu. », « 3 déc. ».
const eventBarWhen = (e: EventPanelState) => {
    if (!e.form.startDate) return '';
    const start = new Date(`${e.form.startDate}T${e.form.allDay ? '00:00' : (e.form.startTime || '00:00')}:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
    if (days === 0) return e.form.allDay ? "Aujourd'hui" : e.form.startTime;
    if (days === 1) return 'Demain';
    return start.toLocaleDateString('fr-FR', days > 0 && days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
};

const orgIdOf = (task: Task) => task.organizationId || String(route.params.orgId || openedOrg.value?.id || '');

const spaceName = (task: Task) => {
    if (!task.spaceId) return 'Général';
    return task.space?.name || openedOrg.value?.spaces?.find(s => s.id === task.spaceId)?.name || 'Espace';
};

const statusIcon = (task: Task) => {
    if (task.status === 'DONE') return 'bi bi-check-circle-fill text-green-500 shrink-0';
    if (task.status === 'IN_PROGRESS') return 'bi bi-arrow-repeat text-blue-400 shrink-0';
    return 'bi bi-circle text-gray-400 shrink-0';
};

const barDue = (task: Task) => {
    if (task.status === 'DONE') return 'Terminée';
    if (!task.dueDate) return '';
    if (isTaskOverdue(task)) return overdueLabel(task.dueDate);
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
    if (days === 0) {
        const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
        return hasTime ? due.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "Aujourd'hui";
    }
    if (days === 1) return 'Demain';
    return due.toLocaleDateString('fr-FR', days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
};
</script>

<style scoped>
/* Une seule largeur pour tout le bas-droite (--br-width, style.css) : chaque
   panneau déplié, les barres réduites, les transferts et les toasts. */
.task-dock {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    min-height: 0;
    max-width: calc(100vw - 2rem);
    pointer-events: none;
}

.task-bars {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
    width: var(--br-width, 25rem);
    max-width: 100%;
    flex-shrink: 0;
}

/* Panneaux dépliés en ligne, alignés en bas, le plus récent à droite. */
.task-panels {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    min-height: 0;
    max-width: 100%;
}

/* Pastille « Tout fermer » : discrète, alignée à droite au-dessus des barres. */
.close-all {
    pointer-events: auto;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 1.9rem;
    padding: 0 0.8rem;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border-color);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
    transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}
.close-all:hover { border-color: color-mix(in srgb, var(--primary) 50%, transparent); }
.close-all.is-confirm {
    color: rgb(248 113 113);
    border-color: rgb(239 68 68 / 0.5);
    background: color-mix(in srgb, rgb(239 68 68) 10%, var(--bg));
}
.close-all-sep { width: 1px; height: 0.9rem; background: var(--border-color); }
.close-all-enter-active, .close-all-leave-active { transition: opacity 0.2s, transform 0.2s; }
.close-all-enter-from, .close-all-leave-to { opacity: 0; transform: translateY(6px) scale(0.95); }

.task-panel {
    width: var(--br-width, 25rem);
    flex-shrink: 0;
    max-width: 100%;
    min-height: 0;
    max-height: min(44rem, 100%);
    display: flex;
    flex-direction: column;
}
</style>
