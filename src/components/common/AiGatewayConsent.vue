<template>

    <Teleport to="body">

        <Transition name="fade">

            <div v-if="request" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">

                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="deny" />

                <div
                    class="relative w-full max-w-md transform rounded-2xl bg-(--bg2) p-6 shadow-2xl border border-(--text)/10 transition-all scale-animation"
                >

                    <div class="flex items-center gap-4 text-amber-500 mb-4">
                        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                            <i class="bi bi-shield-exclamation text-2xl" />
                        </div>
                        <h3 class="text-xl font-bold text-(--text)">Passerelle IA externe</h3>
                    </div>

                    <p class="text-(--text) text-sm leading-relaxed mb-4">
                        Cette organisation utilise une passerelle IA auto-hébergée à l'adresse :
                    </p>

                    <p class="font-mono text-sm text-(--text) bg-black/20 border border-(--text)/10 rounded-lg px-4 py-2 mb-4 break-all select-all">
                        {{ request.origin }}
                    </p>

                    <div class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
                        <i class="bi bi-exclamation-triangle-fill text-amber-500 mt-0.5 shrink-0" />
                        <span class="text-xs text-amber-500 leading-snug">
                            Vos messages, votre session Synco (jeton d'accès) et la clé de chiffrement
                            des sessions IA de cette organisation seront envoyés à cette adresse à chaque
                            message. N'autorisez que si vous reconnaissez et faites confiance à cette passerelle.
                        </span>
                    </div>

                    <div class="flex flex-col sm:flex-row gap-3 sm:justify-end">

                        <button @click="deny" class="default">
                            Refuser
                        </button>

                        <button @click="allow" class="danger">
                            Autoriser cette adresse
                        </button>

                    </div>

                </div>

            </div>

        </Transition>

    </Teleport>

</template>

<script setup lang="ts">
import { pendingGatewayConsent as request } from '@/services/aiGatewayPolicy';

// Panneau global monté une fois (App.vue), piloté par aiGatewayPolicy.ts —
// jamais de confirm()/alert() natif, convention du projet (audit FC5).
const allow = () => request.value?.resolve(true);
const deny = () => request.value?.resolve(false);
</script>

<style scoped>

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.scale-animation {
  animation: modalScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalScale {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

</style>
