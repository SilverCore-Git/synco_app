import { ref } from 'vue';

/** Plafond des entrées du dock bas-droite, partagé entre les tâches/évènements et les conversations Synco AI. */
export const MAX_PANELS = 8;

/** Entrées ouvertes par les tâches et les évènements (tenu par useTaskPanels.ts). */
export const taskPanelSlots = ref(0);

/** Entrées ouvertes par les conversations Synco AI (tenu par useAgentDock.ts) ; les tâches s'arrêtent à `MAX_PANELS` moins ce nombre. */
export const agentPanelSlots = ref(0);
