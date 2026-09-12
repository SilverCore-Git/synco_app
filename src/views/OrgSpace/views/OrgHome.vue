<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-house text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Accueil</h3>
            </div>
        </div>

        <main class="flex-1 overflow-y-auto p-4 md:p-6">
            <h2 class="text-xl font-bold text-(--text) mb-6">{{ greeting }}, {{ $p(user?.name) }} 👋</h2>

            <div class="dash-grid">
                <PendingMessagesCard />
                <AgendaCard v-if="agendaEnabled" />
                <TodosCard v-if="todoEnabled" />
            </div>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { user, todoEnabled, agendaEnabled } from '@/assets/var';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import PendingMessagesCard from '../components/Home/PendingMessagesCard.vue';
import AgendaCard from '../components/Home/AgendaCard.vue';
import TodosCard from '../components/Home/TodosCard.vue';

const greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 6) return 'Bonsoir';
    if (hour < 18) return 'Bonjour';
    return 'Bonsoir';
});
</script>

<style scoped>
.dash-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.25rem;
    align-items: start;
}

.dash-grid > * {
    max-height: 22rem;
}
</style>
