<template>

    <template v-if="until !== undefined">
        <p @click.stop class="px-3 pt-1.5 pb-1 text-xs text-(--text2) cursor-default">
            <i class="bi bi-bell-slash-fill mr-1" />
            {{ until ? `Muet jusqu'au ${formatUntil(until)}` : 'Muet jusqu\'à réactivation' }}
        </p>
        <button @click="unmute(kind, id)" class="dropdown-item-annimate dropdown-item-style">
            <i class="bi bi-bell-fill mr-2" />
            Réactiver les notifications
        </button>
    </template>

    <template v-else>
        <p @click.stop class="px-3 pt-1.5 pb-1 text-xs text-(--text2) cursor-default">
            <i class="bi bi-bell-slash-fill mr-1" />
            Désactiver les notifications
        </p>
        <button
            v-for="option in options"
            :key="option.value"
            @click="mute(kind, id, option.value)"
            class="dropdown-item-annimate dropdown-item-style pl-7!"
        >
            {{ option.label }}
        </button>
    </template>

    <hr v-if="separator" class="my-1 border-(--border-color)" />

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { useNotificationMutes, type MuteDuration, type MuteKind } from '@/composables/useNotificationMutes';

const props = defineProps<{
    kind: MuteKind;
    id: string;
    /** Trait sous les options, quand d'autres actions suivent dans le menu. */
    separator?: boolean;
}>();

const { mutedUntil, mute, unmute } = useNotificationMutes();

const until = computed(() => mutedUntil(props.kind, props.id));

const options: { value: MuteDuration; label: string }[] = [
    { value: '8h', label: 'Pendant 8 heures' },
    { value: '7d', label: 'Pendant 7 jours' },
    { value: '30d', label: 'Pendant 30 jours' },
    { value: 'forever', label: 'Jusqu\'à réactivation' },
];

const formatUntil = (date: Date) => new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
}).format(date);

</script>
