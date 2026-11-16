<template>
    <!-- Bureau : entrées réduites en colonne, puis l'entrée dépliée au plus près
         du bas, toutes sur la même largeur. Monté dans la colonne bas-droite
         d'App.vue, au-dessus de l'overlay des transferts : tout s'empile dans
         la hauteur. Toujours rendu (même vide) pour que les animations
         d'ouverture et de fermeture aient un parent stable. -->
    <div v-if="!isLittleScreen" ref="dockEl" class="task-dock">
        <div v-if="minimizedPanels.length" class="grid grid-cols-1 gap-2 w-full shrink-0">
            <!-- Glisser une barre vers la droite la ferme. -->
            <div
                v-for="p in minimizedPanels"
                :key="p.id"
                :data-task-id="p.id"
                data-kind="bar"
                class="task-bar touch-pan-y"
                @pointerdown="onBarPointerDown($event, p.id)"
            >
                <button
                    type="button"
                    class="flex-1 min-w-0 h-full flex items-center gap-2 pl-3 text-left"
                    :title="`Déplier : ${panelTitle(p)}`"
                    @click="onBarClick(p.id)"
                >
                    <i :class="panelIcon(p)"></i>
                    <span class="flex-1 min-w-0 truncate text-sm font-semibold" :class="p.task || p.draft?.form.title ? 'text-(--text)' : 'text-(--text2)'">{{ panelTitle(p) }}</span>
                    <span v-if="p.task && barDue(p.task)" class="text-[11px] whitespace-nowrap" :class="isTaskOverdue(p.task) ? 'text-red-500 font-bold' : 'text-(--text2)'">{{ barDue(p.task) }}</span>
                    <span v-else-if="p.draft" class="text-[11px] whitespace-nowrap text-(--text2)">Brouillon</span>
                </button>
                <button type="button" class="dock-btn mr-1" :aria-label="`Fermer : ${panelTitle(p)}`" title="Fermer" @click="close(p.id)">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </div>

        <section
            v-if="expanded"
            :key="expanded.id"
            :data-task-id="expanded.id"
            data-kind="panel"
            class="task-panel"
            role="dialog"
            :aria-label="expanded.task ? `Tâche : ${expanded.task.title}` : 'Nouvelle tâche'"
            @keydown.escape="minimizeTask(expanded.id)"
        >
            <!-- Tirer l'en-tête vers le bas réduit le panneau. -->
            <header
                class="flex items-center gap-1.5 pl-4 pr-2 py-2 border-b border-(--border-color) shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
                title="Glisser vers le bas pour réduire"
                @pointerdown="onHeaderPointerDown($event, expanded.id)"
            >
                <i :class="panelIcon(expanded)"></i>
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
                    {{ expanded.draft?.parentTaskId ? 'Nouvelle sous-tâche' : 'Nouvelle tâche' }}
                </div>
                <button type="button" class="dock-btn" title="Réduire" aria-label="Réduire" @click="minimizeTask(expanded.id)">
                    <i class="bi bi-dash-lg"></i>
                </button>
                <button type="button" class="dock-btn" title="Fermer" aria-label="Fermer" @click="close(expanded.id)">
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
        </section>
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
                    <i class="bi bi-check2-square text-(--primary)"></i>
                    {{ expanded?.task ? spaceName(expanded.task) : (expanded?.draft?.parentTaskId ? 'Nouvelle sous-tâche' : 'Nouvelle tâche') }}
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
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Popup from '@/components/Popup.vue';
import TaskDetails from './TaskDetails.vue';
import TaskCreateForm from './TaskCreateForm.vue';
import type { Task } from '@/types/types';
import { isLittleScreen, openedOrg } from '@/assets/var';
import { isTaskOverdue, overdueLabel } from '@/assets/utils/taskOverdue';
import { useTaskPanels, type TaskPanel } from '@/composables/useTaskPanels';
import useMotion from '@/composables/useMotion';

const route = useRoute();
const { panels, openTaskById, minimizeTask, restoreTask, closeTask, closeAllTasks } = useTaskPanels();
const { animationsEnabled } = useMotion();

const dockEl = ref<HTMLElement | null>(null);
const expanded = computed(() => panels.value.find(p => !p.minimized) ?? null);
const minimizedPanels = computed(() => panels.value.filter(p => p.minimized));

// Les tâches appartiennent à une organisation (membres, espaces, droits) :
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
    if (e.button !== 0 || (e.target as HTMLElement).closest('.dock-btn')) return;
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

function onBarClick(id: string) {
    if (suppressBarClick) return;
    restoreTask(id);
}

// ── Affichage ──────────────────────────────────────────────────────────
const currentOrgId = computed(() => String(route.params.orgId || openedOrg.value?.id || ''));

const panelTitle = (p: TaskPanel) => p.task?.title ?? (p.draft?.form.title.trim() || 'Nouvelle tâche');

const panelIcon = (p: TaskPanel) => p.task ? statusIcon(p.task) : 'bi bi-plus-circle-dotted text-(--primary) shrink-0';

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
/* Une seule largeur pour tout le dock : la tâche dépliée et la grille des
   tâches réduites (deux par ligne, la dernière seule prend toute la ligne). */
.task-dock {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    min-height: 0;
    width: 25rem;
    max-width: calc(100vw - 2rem);
    pointer-events: none;
}

.task-panel {
    pointer-events: auto;
    width: 100%;
    min-height: 0;
    max-height: 44rem;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 1.1rem;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.12);
    overflow: hidden;
}

.task-bar {
    pointer-events: auto;
    min-width: 0;
    height: 2.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 0.9rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
    transition: border-color 0.15s;
}
.task-bar:hover { border-color: color-mix(in srgb, var(--primary) 50%, transparent); }

.dock-btn {
    width: 1.9rem;
    height: 1.9rem;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 0.55rem;
    color: var(--text2);
    font-size: 0.85rem;
    transition: background-color 0.15s, color 0.15s;
}
.dock-btn:hover { background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); }
</style>
