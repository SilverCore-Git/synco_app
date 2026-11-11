<template>

    <div class="login" :data-state="state">

        <!-- Moitié gauche : ce que l'on retrouve en se connectant, montré comme dans l'app (un salon chiffré). -->
        <aside class="brand" aria-hidden="true">
            <img src="/banner.svg" alt="" class="brand-logo" />

            <div class="brand-body">
                <p class="brand-title">Tout votre travail, chiffré.</p>
                <p class="brand-sub">Messages, fichiers, appels et agenda de votre équipe, au même endroit.</p>

                <div class="fragment">
                    <div class="fragment-head">
                        <span class="fragment-channel"><i class="bi bi-hash" />lancement-v2</span>
                        <span class="fragment-lock"><i class="bi bi-lock-fill" /> Chiffré de bout en bout</span>
                    </div>
                    <ul class="fragment-msgs">
                        <li v-for="m in MESSAGES" :key="m.time">
                            <span class="avatar" :style="{ '--h': m.hue }">{{ m.name[0] }}</span>
                            <div class="min-w-0">
                                <p class="msg-meta"><strong>{{ m.name }}</strong><time>{{ m.time }}</time></p>
                                <p class="msg-text">{{ m.text }}</p>
                                <p v-if="m.file" class="msg-file"><i class="bi bi-file-earmark-pdf" /> {{ m.file }}</p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </aside>

        <!-- Moitié droite : une question, une action -->
        <main class="panel">
            <div class="panel-inner">
                <img :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'" alt="Synco" class="panel-logo" />

                <div class="greeting">
                    <span v-if="known" class="avatar avatar-lg" :style="{ '--h': 152 }" aria-hidden="true">{{ known[0] }}</span>
                    <h1>{{ known ? `Bon retour, ${known}` : 'Bienvenue sur Synco' }}</h1>
                    <p>{{ known ? 'Vos espaces de travail vous attendent.' : 'Connectez-vous pour retrouver vos espaces de travail.' }}</p>
                </div>

                <button class="primary w-full cta" :class="{ loader: loading }" :disabled="loading" @click="emit('login')">
                    <span class="font-bold">{{ loading ? 'En attente du navigateur…' : error ? 'Réessayer' : 'Continuer dans le navigateur' }}</span>
                    <i class="bi bi-box-arrow-up-right" aria-hidden="true" />
                </button>

                <button v-if="loading" class="cancel" @click="emit('cancel')">Annuler</button>

                <p v-if="error" class="error" role="alert">
                    <i class="bi bi-exclamation-circle" aria-hidden="true" />
                    La connexion n'a pas abouti. Le navigateur a peut-être été fermé avant la fin.
                </p>

                <!-- Le relais navigateur ↔ application : un mode d'emploi au repos, un suivi en direct pendant l'attente -->
                <ol class="relay" aria-label="Étapes de connexion" aria-live="polite">
                    <li v-for="(s, i) in STEPS" :key="s" :class="stepClass(i)" :aria-current="stepClass(i) === 'is-current' ? 'step' : undefined">
                        <span class="relay-mark" aria-hidden="true">
                            <i v-if="stepClass(i) === 'is-done'" class="bi bi-check-lg" />
                            <span v-else-if="stepClass(i) === 'is-current'" class="relay-spin" />
                            <template v-else>{{ i + 1 }}</template>
                        </span>
                        <span>{{ i === 1 && loading ? 'Connectez-vous dans l\'onglet qui vient de s\'ouvrir' : s }}</span>
                    </li>
                </ol>

                <p class="trust"><i class="bi bi-shield-lock" aria-hidden="true" /> Votre mot de passe ne passe jamais par l'application.</p>

                <button v-if="known && !loading" class="switch" @click="forget">Ce n'est pas vous ? Utiliser un autre compte</button>
            </div>
        </main>

    </div>

</template>

<script setup lang="ts">
/**
 * Écran de connexion de l'application de bureau (Tauri). La connexion se fait dans le navigateur système
 * (Keycloak, PKCE, retour par fr.silvercore.synco://callback) : l'écran le montre comme un relais en trois
 * étapes, suivies en direct pendant l'attente. S'il connaît le prénom du dernier compte ouvert sur cet
 * ordinateur (rememberDesktopAccount), il l'accueille par son nom ; rien d'autre n'est gardé.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import useSettingsItem from '@/composables/useSettingsItem';
import { forgetDesktopAccount, lastDesktopAccount } from '@/assets/desktopAccount';

const props = defineProps<{ loading: boolean; error: boolean }>();
const emit = defineEmits<{ login: []; cancel: [] }>();

// Échap annule l'attente, comme le lien « Annuler ».
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && props.loading) emit('cancel'); };
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

const { Item: theme } = useSettingsItem('theme', 'dark');

const known = ref(lastDesktopAccount());
function forget() {
    forgetDesktopAccount();
    known.value = null;
}

const STEPS = ['Votre navigateur s\'ouvre', 'Vous vous connectez', 'Synco s\'ouvre ici'];
const state = computed(() => props.loading ? 'waiting' : props.error ? 'error' : 'idle');
/** En attente : l'étape 1 est faite, la 2 est en cours. */
const stepClass = (i: number) => !props.loading ? '' : i === 0 ? 'is-done' : i === 1 ? 'is-current' : '';

/** Fragment du produit (illustration) : un salon tel qu'il apparaît dans l'app. */
const MESSAGES = [
    { name: 'Léa Martin', time: '09:41', hue: 152, text: 'La maquette finale est en ligne, dites-moi si ça vous va.', file: 'maquette-accueil-v3.pdf · 2,4 Mo' },
    { name: 'Hugo Roux', time: '09:43', hue: 28, text: 'Je relis avant midi et je valide avec le client.' },
    { name: 'Inès Benali', time: '09:47', hue: 262, text: 'Appel de lancement demain à 10 h, je l\'ai mis à l\'agenda.' },
];
</script>

<style scoped>
.login { display: grid; grid-template-columns: minmax(0, 46fr) minmax(0, 54fr); width: 100%; height: 100%; background: var(--bg2); user-select: none; }

/* ---------- moitié gauche : un champ de vert profond ---------- */
.brand {
    --ink: #eafff5; --ink2: rgb(234 255 245 / 0.68); --line: rgb(234 255 245 / 0.12);
    position: relative; display: flex; flex-direction: column; padding: 2.5rem 3rem; overflow: hidden;
    background: #062d1f; color: var(--ink);
}
.brand-logo { height: 2rem; width: auto; align-self: flex-start; }
.brand-body { margin-top: auto; }
.brand-title { font-size: 2.25rem; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; max-width: 14ch; }
.brand-sub { margin-top: 0.875rem; font-size: 1rem; line-height: 1.5; color: var(--ink2); max-width: 34ch; }

.fragment {
    margin-top: 2.25rem; border-radius: 1rem; background: rgb(0 0 0 / 0.28); border: 1px solid var(--line);
    /* Le fragment déborde à droite et en bas : un morceau de l'app, pas une carte posée au milieu. */
    margin-right: -4.5rem; margin-bottom: -4rem; padding-bottom: 3rem;
}
.fragment-head { display: flex; align-items: center; gap: 0.875rem; padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--line); font-size: 0.8125rem; }
.fragment-channel { display: inline-flex; align-items: center; gap: 0.125rem; font-weight: 700; }
.fragment-lock { color: #6ee7b7; font-size: 0.75rem; white-space: nowrap; }
.fragment-msgs { display: grid; gap: 1.125rem; padding: 1.25rem 1.25rem 0; }
.fragment-msgs li { display: flex; gap: 0.75rem; }
.msg-meta { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.8125rem; }
.msg-meta time { font-size: 0.6875rem; color: var(--ink2); font-variant-numeric: tabular-nums; }
.msg-text { margin-top: 0.125rem; font-size: 0.875rem; line-height: 1.45; color: var(--ink); opacity: 0.9; }
.msg-file {
    display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; padding: 0.4rem 0.7rem; border-radius: 0.6rem;
    border: 1px solid var(--line); font-size: 0.75rem; color: var(--ink2);
}

/* Initiale sur une teinte pâle propre à chaque personne (identité, pas décor). */
.avatar {
    flex: none; display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%;
    font-size: 0.8125rem; font-weight: 700; color: hsl(var(--h) 60% 18%); background: hsl(var(--h) 55% 78%);
}
.avatar-lg { width: 3.25rem; height: 3.25rem; font-size: 1.25rem; margin: 0 auto 1rem; }

/* ---------- moitié droite ---------- */
.panel { display: grid; place-items: center; padding: 2.5rem 2.5rem 4.5rem; background: var(--bg); overflow-y: auto; }
.panel-inner { width: 100%; max-width: 23rem; }
.panel-logo { display: none; height: 2.5rem; margin: 0 auto 2rem; }

.greeting { text-align: center; margin-bottom: 2rem; }
.greeting h1 { font-size: 1.625rem; line-height: 1.2; font-weight: 800; letter-spacing: -0.01em; color: var(--text); }
.greeting p { margin-top: 0.5rem; font-size: 0.9375rem; color: var(--text2); }

.cta { gap: 0.625rem; padding-block: 0.85em; }
.cta i { font-size: 0.875rem; }

.cancel { display: block; margin: 0.875rem auto 0; padding: 0.25rem 0.5rem; font-size: 0.875rem; color: var(--text2); text-underline-offset: 3px; transition: color 0.15s ease; }
.cancel:hover { color: var(--text); text-decoration: underline; }

.error { display: flex; align-items: flex-start; gap: 0.5rem; margin-top: 0.875rem; font-size: 0.8125rem; line-height: 1.45; color: #ef4444; }
.error i { margin-top: 0.1rem; }

.relay { display: grid; gap: 0.75rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); }
.relay li { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; color: var(--text2); transition: color 0.2s ease; }
.relay li.is-current, .relay li.is-done { color: var(--text); }
.relay-mark {
    flex: none; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%;
    font-size: 0.75rem; font-weight: 700; font-variant-numeric: tabular-nums;
    border: 1px solid var(--border-color); color: var(--text2); transition: all 0.2s ease;
}
.is-done .relay-mark { border-color: var(--primary); background: var(--primary); color: #fff; }
.is-current .relay-mark { border-color: transparent; }
.relay-spin { width: 1.125rem; height: 1.125rem; border-radius: 50%; border: 2px solid var(--border-color); border-top-color: var(--primary); animation: spin 0.9s linear infinite; }

.trust { display: flex; align-items: center; gap: 0.5rem; margin-top: 1.75rem; font-size: 0.8125rem; color: var(--text2); }
.switch { display: block; margin: 1.25rem auto 0; font-size: 0.8125rem; color: var(--text2); text-underline-offset: 3px; transition: color 0.15s ease; }
.switch:hover { color: var(--text); text-decoration: underline; }

/* Fenêtre étroite : la connexion seule, avec le logo au-dessus. */
@media (max-width: 56rem) {
    .login { grid-template-columns: 1fr; }
    .brand { display: none; }
    .panel-logo { display: block; }
}

@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .relay-spin { animation-duration: 2.5s; } }
</style>
