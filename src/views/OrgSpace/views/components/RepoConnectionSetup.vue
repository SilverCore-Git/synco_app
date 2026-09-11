<template>

    <Popup :is-open="true" @close="handleClose" class="max-w-lg">
        <template #title>{{ step === 'form' ? 'Connecter un dépôt Git' : 'Clé de déploiement générée' }}</template>

        <!-- Étape 1 : formulaire -->
        <form v-if="step === 'form'" @submit.prevent="handleCreate" class="space-y-6">

            <div class="flex items-start gap-3 p-4 bg-(--white)/5 border border-(--white)/10 rounded-xl">
                <i class="bi bi-shield-lock text-(--primary) text-lg shrink-0 mt-0.5" />
                <p class="text-xs text-(--text2) leading-relaxed">
                    Synco génère une paire de clés SSH dédiée à cette connexion et n'accède au dépôt
                    qu'en <strong class="text-(--text)">lecture seule</strong> (métadonnées de branches et de commits
                    uniquement — jamais le contenu des fichiers, jamais d'écriture).
                </p>
            </div>

            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Nom de la connexion <span class="text-red-500">*</span>
                </label>
                <input
                    v-model="name"
                    type="text"
                    placeholder="Backend API, Site Marketing, etc."
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                    required
                    :maxlength="100"
                />
            </div>

            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    URL du remote Git <span class="text-red-500">*</span>
                </label>
                <input
                    v-model="remoteUrl"
                    type="text"
                    placeholder="git@github.com:organisation/depot.git"
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all font-mono text-sm"
                    required
                />
                <p class="text-xs text-(--text2) mt-1">
                    Format SSH recommandé (git@hôte:organisation/dépôt.git) — fonctionne avec GitHub, GitLab, Gitea
                    ou tout serveur Git générique.
                </p>
            </div>

            <div v-if="projects && projects.length > 0">
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Projet (optionnel)
                </label>
                <select
                    v-model="projectId"
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) focus:outline-none focus:border-(--primary)/40 transition-all"
                >
                    <option value="">Aucun</option>
                    <option v-for="project in projects" :key="project.id" :value="project.id">
                        {{ project.name }}
                    </option>
                </select>
                <p class="text-xs text-(--text2) mt-1">
                    Regroupe ce dépôt avec d'autres au sein d'un projet interne à Synco.
                </p>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-(--white)/10">
                <button type="button" @click="handleClose" class="default px-6 py-2" :disabled="loading">
                    Annuler
                </button>
                <button type="submit" class="primary px-6 py-2 flex items-center gap-2" :disabled="loading || !isFormValid">
                    <SpinLoader v-if="loading" class="!h-4 !w-4" />
                    <span v-else>Créer la connexion</span>
                </button>
            </div>

        </form>

        <!-- Étape 2 : révélation de la clé publique -->
        <div v-else class="space-y-6">

            <div class="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <i class="bi bi-check-circle-fill text-green-500 text-lg shrink-0 mt-0.5" />
                <p class="text-xs text-green-200/90 leading-relaxed">
                    Connexion <strong>{{ createdConnection?.name }}</strong> créée. Ajoutez la clé publique ci-dessous
                    comme <strong>deploy key en lecture seule</strong> sur votre hébergeur avant de lancer une synchronisation.
                </p>
            </div>

            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">Clé publique (ed25519)</label>
                <div class="relative">
                    <textarea
                        readonly
                        :value="createdConnection?.publicKey"
                        rows="3"
                        class="w-full bg-black/20 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) font-mono text-xs resize-none select-all"
                        @click="($event.target as HTMLTextAreaElement).select()"
                    />
                    <button
                        type="button"
                        @click="copyKey"
                        class="absolute top-3 right-3 text-(--text2) hover:text-(--primary) transition-all p-1.5 rounded-lg hover:bg-(--white)/10"
                        title="Copier dans le clipboard"
                    >
                        <i class="bi bi-clipboard" />
                    </button>
                </div>
                <p v-if="createdConnection?.keyFingerprint" class="text-xs text-(--text2) mt-1 font-mono">
                    Empreinte : {{ createdConnection.keyFingerprint }}
                </p>
            </div>

            <div class="p-4 bg-(--white)/5 border border-(--white)/10 rounded-xl space-y-2">
                <h4 class="text-sm font-semibold text-(--text) flex items-center gap-2">
                    <i class="bi bi-list-ol text-(--primary)" /> Étapes suivantes
                </h4>
                <ol class="text-xs text-(--text2) space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Ouvrez les paramètres de votre dépôt sur votre hébergeur (GitHub : Settings → Deploy keys, GitLab : Settings → Repository → Deploy keys, Gitea : Settings → Deploy Keys).</li>
                    <li>Ajoutez une nouvelle deploy key en collant la clé publique ci-dessus.</li>
                    <li><strong class="text-(--text)">Ne cochez pas</strong> l'option d'accès en écriture — Synco n'en a pas besoin et ne push jamais.</li>
                    <li>Revenez ici et déclenchez une synchronisation manuelle pour vérifier que tout fonctionne.</li>
                </ol>
                <a
                    href="https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 text-xs text-(--primary) hover:underline pt-1"
                >
                    <i class="bi bi-box-arrow-up-right" /> Guide officiel GitHub — configurer une deploy key
                </a>
            </div>

            <div class="flex justify-end pt-4 border-t border-(--white)/10">
                <button type="button" @click="finish" class="primary px-6 py-2">
                    J'ai ajouté la clé — Terminer
                </button>
            </div>

        </div>

    </Popup>

</template>

<script lang="ts" setup>

import { ref, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import { useRepos } from '@/composables/useRepos';
import type { RepoProject, RepoConnection } from '@/types/repos';

const props = defineProps<{
    orgId: string;
    spaceId: string;
    projects?: RepoProject[];
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'created', connection: RepoConnection): void;
}>();

const { createConnection, copyPublicKey } = useRepos();

const step = ref<'form' | 'reveal'>('form');
const name = ref<string>('');
const remoteUrl = ref<string>('');
const projectId = ref<string>('');
const loading = ref<boolean>(false);
const createdConnection = ref<RepoConnection | null>(null);

const isFormValid = computed(() => {
    return name.value.trim().length > 0 &&
           name.value.length <= 100 &&
           remoteUrl.value.trim().length > 0;
});

const handleCreate = async () => {
    if (!isFormValid.value) return;

    loading.value = true;

    try {
        const result = await createConnection(props.orgId, props.spaceId, {
            name: name.value.trim(),
            remoteUrl: remoteUrl.value.trim(),
            projectId: projectId.value || undefined
        });

        if (result?.success && result.connection) {
            createdConnection.value = result.connection;
            step.value = 'reveal';
        }
    } finally {
        loading.value = false;
    }
};

const copyKey = async () => {
    if (createdConnection.value) {
        await copyPublicKey(createdConnection.value);
    }
};

const finish = () => {
    if (createdConnection.value) {
        emit('created', createdConnection.value);
    }
    emit('close');
};

const handleClose = () => {
    // Une fois la connexion créée, fermer revient à "Terminer" (la connexion
    // existe déjà côté serveur, il ne faut pas la faire disparaître de la liste).
    if (step.value === 'reveal') {
        finish();
    } else {
        emit('close');
    }
};

</script>
