<template>
    <div class="space-y-8">

        <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h3 class="text-2xl font-black text-(--text) mb-1 flex items-center gap-2">
                    <i class="bi bi-terminal-fill text-(--primary)" /> Développeur
                </h3>
                <p class="text-sm text-(--text2)">
                    Build de l'application, état des services vus depuis cet appareil et coffre de clés.
                    <span v-if="checkedAt" class="whitespace-nowrap">Vérifié à {{ new Date(checkedAt).toLocaleTimeString('fr-FR') }}.</span>
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                <button class="second flex items-center gap-2 text-xs" :disabled="loading" @click="refresh">
                    <i class="bi bi-arrow-clockwise" :class="{ 'animate-spin': loading }" /> Rafraîchir
                </button>
                <button class="second flex items-center gap-2 text-xs" :disabled="loading" @click="copyReport">
                    <i class="bi bi-clipboard" /> Copier le rapport
                </button>
                <button class="second flex items-center gap-2 text-xs" @click="emit('hide')" title="Fermer la vue Développeur">
                    <i class="bi bi-x-lg" /> Fermer
                </button>
            </div>
        </div>

        <!-- RÉSUMÉ -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="summary">
                <span class="summary-label">Application</span>
                <span class="summary-value font-mono">v{{ buildVersion }}</span>
            </div>
            <div class="summary">
                <span class="summary-label">API</span>
                <span class="summary-value font-mono">{{ apiRow?.version ? `v${apiRow.version}` : '—' }}</span>
            </div>
            <div class="summary">
                <span class="summary-label">Services</span>
                <span class="summary-value" :class="servicesTone">{{ upCount }} / {{ services.length || '—' }}</span>
            </div>
            <div class="summary">
                <span class="summary-label">Coffre</span>
                <span class="summary-value" :class="vaultHealth.tone">{{ vaultHealth.label }}</span>
            </div>
        </div>

        <!-- SERVICES -->
        <div class="space-y-3">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Services</h4>
            <div class="grid gap-3 lg:grid-cols-2">
                <div
                    v-for="s in services"
                    :key="s.id"
                    class="p-4 bg-(--bg2) border border-(--border-color) rounded-xl flex gap-3 min-w-0"
                >
                    <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center" :class="STATUS[s.status].iconBg">
                        <i class="bi text-lg" :class="s.icon" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-bold text-sm text-(--text)">{{ s.label }}</span>
                            <span class="pill" :class="STATUS[s.status].pill">
                                <i v-if="s.status === 'checking'" class="bi bi-arrow-repeat animate-spin" />
                                {{ STATUS[s.status].label }}
                            </span>
                            <span v-if="s.latencyMs !== null" class="text-[11px] font-mono" :class="latencyTone(s.latencyMs)">{{ s.latencyMs }} ms</span>
                        </div>
                        <p class="text-xs text-(--text2) mt-1 font-mono truncate">
                            <span :class="s.version ? 'text-(--text)' : ''">{{ s.version ? `v${s.version}` : 'version inconnue' }}</span>
                            <span v-if="s.commit"> · {{ s.commit }}</span>
                        </p>
                        <p v-if="s.url" class="text-[11px] text-(--text2) font-mono truncate" :title="s.url">{{ s.url }}</p>
                        <ul v-if="s.details.length" class="mt-1.5 space-y-0.5">
                            <li v-for="(d, i) in s.details" :key="i" class="text-[11px] text-(--text2) break-words">{{ d }}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- APPLICATION -->
        <div class="space-y-3">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Application</h4>
            <dl class="info-list">
                <div v-for="l in app" :key="l.label" class="info-row">
                    <dt>{{ l.label }}</dt>
                    <dd :class="[l.mono ? 'font-mono text-xs' : '', toneClass(l.tone)]">{{ l.value }}</dd>
                </div>
            </dl>
        </div>

        <!-- COFFRE DE CLÉS -->
        <div v-if="vault" class="space-y-3">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Coffre de clés de l'appareil</h4>

            <div class="grid gap-2 sm:grid-cols-2">
                <div v-for="c in vaultChecks" :key="c.label" class="p-3 bg-(--bg2) border border-(--border-color) rounded-xl flex items-start gap-3">
                    <i class="bi text-lg shrink-0 mt-0.5" :class="CHECK_ICONS[c.tone]" />
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-(--text)">{{ c.label }}</p>
                        <p class="text-xs text-(--text2) break-words">{{ c.detail }}</p>
                    </div>
                </div>
            </div>

            <dl class="info-list">
                <div class="info-row">
                    <dt>Coffre attendu sur cette plateforme</dt>
                    <dd>{{ vault.expected ? VAULT_LABELS[vault.expected] : '—' }}</dd>
                </div>
                <div class="info-row">
                    <dt>Coffre enregistré</dt>
                    <dd>{{ vault.kind ? VAULT_LABELS[vault.kind] : 'aucun' }}</dd>
                </div>
                <div v-if="vault.deviceId" class="info-row">
                    <dt>Identifiant d'appareil</dt>
                    <dd class="font-mono text-xs">{{ vault.deviceId }}</dd>
                </div>
                <div v-if="vault.enrolledAt" class="info-row">
                    <dt>Inscrit le</dt>
                    <dd>{{ formatDate(vault.enrolledAt) }}</dd>
                </div>
                <div v-if="vault.capabilities" class="info-row">
                    <dt>Protection</dt>
                    <dd>
                        {{ vault.capabilities.hardwareBacked ? 'matérielle' : 'logicielle' }}
                        · {{ vault.capabilities.biometric ? 'biométrie' : 'sans biométrie' }}
                        · essais limités : {{ RATE_LIMIT[vault.capabilities.rateLimit] }}
                    </dd>
                </div>
                <div v-for="l in vault.extra" :key="l.label" class="info-row">
                    <dt>{{ l.label }}</dt>
                    <dd :class="[l.mono ? 'font-mono text-xs' : '', toneClass(l.tone)]">{{ l.value }}</dd>
                </div>
            </dl>
        </div>

        <!-- MOBILE -->
        <div v-if="mobile.length" class="space-y-3">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Appareil mobile</h4>
            <dl class="info-list">
                <div v-for="l in mobile" :key="l.label" class="info-row">
                    <dt>{{ l.label }}</dt>
                    <dd :class="[l.mono ? 'font-mono text-xs' : '', toneClass(l.tone)]">{{ l.value }}</dd>
                </div>
            </dl>
        </div>

    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDevInfo, VAULT_LABELS, formatDate, type InfoLine, type ProbeStatus } from '@/composables/useDevInfo';
import { useToast } from '@/composables/useToast';

const emit = defineEmits<{ hide: [] }>();
const toast = useToast();
const { loading, app, mobile, services, vault, checkedAt, refresh, report } = useDevInfo();

const buildVersion = __APP_BUILD__.version;

type Tone = 'ok' | 'warn' | 'error';

const STATUS: Record<ProbeStatus, { label: string; pill: string; iconBg: string }> = {
    checking: { label: 'Vérification', pill: 'bg-(--text)/10 text-(--text2)', iconBg: 'bg-(--text)/10 text-(--text2)' },
    up: { label: 'Opérationnel', pill: 'bg-green-500/15 text-green-500', iconBg: 'bg-green-500/10 text-green-500' },
    degraded: { label: 'Dégradé', pill: 'bg-amber-500/15 text-amber-500', iconBg: 'bg-amber-500/10 text-amber-500' },
    down: { label: 'Hors service', pill: 'bg-red-500/15 text-red-500', iconBg: 'bg-red-500/10 text-red-500' },
    unconfigured: { label: 'Non configuré', pill: 'bg-(--text)/10 text-(--text2)', iconBg: 'bg-(--text)/10 text-(--text2)' },
};

const CHECK_ICONS: Record<Tone, string> = {
    ok: 'bi-check-circle-fill text-green-500',
    warn: 'bi-exclamation-triangle-fill text-amber-500',
    error: 'bi-x-circle-fill text-red-500',
};

const RATE_LIMIT = { hardware: 'par le matériel', software: 'par l\'application', none: 'non (session de l\'OS)' } as const;

const toneClass = (tone?: InfoLine['tone']) =>
    tone === 'ok' ? 'text-green-500' : tone === 'warn' ? 'text-amber-500' : tone === 'error' ? 'text-red-500' : '';

const latencyTone = (ms: number) => (ms < 300 ? 'text-green-500' : ms < 1000 ? 'text-amber-500' : 'text-red-500');

const apiRow = computed(() => services.value.find(s => s.id === 'api'));
const upCount = computed(() => services.value.filter(s => s.status === 'up').length);
const servicesTone = computed(() => {
    const list = services.value;
    if (!list.length || list.some(s => s.status === 'checking')) return '';
    if (list.some(s => s.status === 'down')) return 'text-red-500';
    return list.some(s => s.status === 'degraded') ? 'text-amber-500' : 'text-green-500';
});

const agoText = (at: number) => {
    const s = Math.round((Date.now() - at) / 1000);
    return s < 60 ? 'à l\'instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`;
};

const vaultChecks = computed<{ label: string; detail: string; tone: Tone }[]>(() => {
    const v = vault.value;
    if (!v) return [];
    const checks: { label: string; detail: string; tone: Tone }[] = [];

    if (!v.v4) {
        checks.push({ label: 'Compte en chiffrement v3', detail: 'Pas de coffre d\'appareil : la clé est déverrouillée par le PIN du compte.', tone: 'warn' });
    } else if (!v.enrolled) {
        checks.push({ label: 'Appareil non inscrit', detail: 'Aucune clé d\'appareil sur ce poste : il faut le relier à votre compte.', tone: 'error' });
    } else {
        checks.push({
            label: 'Appareil inscrit',
            detail: `Coffre : ${v.kind ? VAULT_LABELS[v.kind] : '?'}`,
            tone: 'ok',
        });
        checks.push(v.keyPresent === true
            ? { label: 'Clé présente dans le coffre', detail: 'La clé d\'appareil est bien lisible dans le coffre.', tone: 'ok' }
            : v.keyPresent === false
                ? { label: 'Clé absente du coffre', detail: 'Le coffre ne contient plus la clé de cet appareil (trousseau vidé ?).', tone: 'error' }
                : { label: 'Coffre illisible', detail: v.keyError ?? 'Erreur inconnue', tone: 'error' });
        if (v.expected && v.kind && v.expected !== v.kind) {
            checks.push({
                label: 'Coffre de repli',
                detail: `Le coffre recommandé ici est « ${VAULT_LABELS[v.expected]} », mais l'appareil utilise « ${VAULT_LABELS[v.kind]} ».`,
                tone: 'warn',
            });
        }
    }

    checks.push(v.usage
        ? { label: 'Coffre utilisé', detail: `Déverrouillé ${agoText(v.usage.at)} (${v.usage.count} fois depuis le lancement, ${VAULT_LABELS[v.usage.kind]}).`, tone: 'ok' }
        : { label: 'Coffre pas encore utilisé', detail: v.unlocked ? 'Session déverrouillée sans passer par le coffre de cet appareil pendant ce lancement.' : 'Aucun déverrouillage depuis le lancement.', tone: v.v4 ? 'warn' : 'ok' });

    checks.push(v.unlocked
        ? { label: 'Session chiffrée déverrouillée', detail: 'Les clés privées sont chargées en mémoire.', tone: 'ok' }
        : { label: 'Session chiffrée verrouillée', detail: 'Les messages chiffrés ne peuvent pas être lus.', tone: 'warn' });

    if (v.refreshTokenStored !== null) {
        checks.push(v.refreshTokenStored
            ? { label: 'Session dans le trousseau', detail: 'Le jeton de rafraîchissement est stocké dans le trousseau du système.', tone: 'ok' }
            : { label: 'Pas de session dans le trousseau', detail: 'Aucun jeton de rafraîchissement : reconnexion nécessaire au prochain lancement.', tone: 'warn' });
    }
    return checks;
});

const vaultHealth = computed(() => {
    const checks = vaultChecks.value;
    if (!checks.length) return { label: '—', tone: '' };
    if (checks.some(c => c.tone === 'error')) return { label: 'Problème', tone: 'text-red-500' };
    if (checks.some(c => c.tone === 'warn')) return { label: 'À vérifier', tone: 'text-amber-500' };
    return { label: 'OK', tone: 'text-green-500' };
});

const copyReport = async () => {
    try {
        await navigator.clipboard.writeText(report());
        toast.show('Rapport copié', 'success');
    } catch {
        toast.show('Impossible de copier le rapport', 'error');
    }
};

onMounted(refresh);
</script>

<style scoped>
.summary {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-color);
    background: var(--bg2);
    min-width: 0;
}
.summary-label {
    font-size: 0.625rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text2);
}
.summary-value {
    font-size: 1.125rem;
    font-weight: 900;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.summary-value.text-green-500 { color: rgb(34 197 94); }
.summary-value.text-amber-500 { color: rgb(245 158 11); }
.summary-value.text-red-500 { color: rgb(239 68 68); }

.pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.info-list {
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--bg2);
    overflow: hidden;
}
.info-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
}
.info-row + .info-row {
    border-top: 1px solid var(--border-color);
}
.info-row dt {
    color: var(--text2);
}
.info-row dd {
    color: var(--text);
    text-align: right;
    min-width: 0;
    overflow-wrap: anywhere;
}
</style>
