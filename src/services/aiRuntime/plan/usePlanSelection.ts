import { computed, shallowRef, type Ref } from 'vue';
import { evaluateSelection, initialSelection, toggleAction, uncheckAll, type PlanModel, type Selection } from './planModel';

/** État de sélection d'un plan (cases, sensibles tranchées, cascade), partagé par la carte et la fenêtre. */
export function usePlanSelection(model: Ref<PlanModel>) {
    const sel = shallowRef<Selection>(initialSelection(model.value));
    const result = computed(() => evaluateSelection(model.value, sel.value));
    return {
        sel,
        result,
        reset: () => { sel.value = initialSelection(model.value); },
        toggle: (n: number) => { sel.value = toggleAction(model.value, sel.value, n); },
        clear: () => { sel.value = uncheckAll(model.value, sel.value); },
    };
}
