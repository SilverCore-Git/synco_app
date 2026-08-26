<template>
    <div class="h-full overflow-y-auto p-4 md:p-8">
        <form @submit.prevent="submit" class="max-w-2xl mx-auto space-y-6">
            <div>
                <label class="block text-xs font-bold text-(--text2) uppercase tracking-wider mb-2">Domaine</label>
                <select v-model="form.domain" class="w-full bg-(--bg2) border border-(--border-color) rounded-xl px-4 py-3 text-(--text) focus:outline-none focus:border-(--primary)" required>
                    <option value="" disabled>Sélectionnez un domaine</option>
                    <option value="technique">Problème Technique</option>
                    <option value="billing">Facturation</option>
                    <option value="account">Compte & Accès</option>
                    <option value="other">Autre</option>
                </select>
            </div>

            <div>
                <label class="block text-xs font-bold text-(--text2) uppercase tracking-wider mb-2">Sujet</label>
                <input v-model="form.subject" type="text" class="w-full bg-(--bg2) border border-(--border-color) rounded-xl px-4 py-3 text-(--text) focus:outline-none focus:border-(--primary)" placeholder="Résumé de votre problème..." required />
            </div>

            <div v-if="organizations && organizations.length > 0">
                <label class="block text-xs font-bold text-(--text2) uppercase tracking-wider mb-2">Organisation concernée (Optionnel)</label>
                <select v-model="form.orgId" class="w-full bg-(--bg2) border border-(--border-color) rounded-xl px-4 py-3 text-(--text) focus:outline-none focus:border-(--primary)">
                    <option value="">Aucune</option>
                    <option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
                </select>
            </div>

            <div class="flex items-center gap-4 pt-4">
                <button type="button" @click="emit('cancel')" class="default">Annuler</button>
                <button type="submit" class="primary flex items-center gap-2" :disabled="loading">
                    <i v-if="loading" class="bi bi-arrow-repeat animate-spin"></i>
                    Créer le ticket
                </button>
            </div>
        </form>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { organizations, user } from '@/assets/var';
import { generateThreadKey, encryptThreadKeyForMember } from '@/assets/utils/crypto';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

const emit = defineEmits(['created', 'cancel']);
const toast = useToast();

const loading = ref(false);

const form = reactive({
    domain: '',
    subject: '',
    orgId: '',
});

const submit = async () => {
    if (!form.domain || !form.subject) return;
    
    loading.value = true;
    try {
        const keysRes = await sfetch('/api/support/admins/keys');
        if (!keysRes.ok) throw new Error('Erreur récupération clés admins');
        const adminsKeys = await keysRes.json();
        
        const threadKey = await generateThreadKey();
        
        let encryptedKeyForUser = null;
        if (user.value?.publicKey) {
            encryptedKeyForUser = await encryptThreadKeyForMember(threadKey, user.value.publicKey);
        }
        
        const adminKeysPayload = [];
        for (const admin of adminsKeys) {
            if (admin.publicKey) {
                const encryptedKey = await encryptThreadKeyForMember(threadKey, admin.publicKey);
                adminKeysPayload.push({
                    userId: admin.userId,
                    encryptedKey
                });
            }
        }

        const payload = {
            domain: form.domain,
            subject: form.subject,
            orgId: form.orgId || null,
            userEncryptedKey: encryptedKeyForUser,
            adminEncryptedKeys: adminKeysPayload
        };

        const res = await sfetch('/api/support/tickets', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const ticket = await res.json();
            emit('created', ticket);
        } else {
            const error = await res.json();
            toast.show(error.error || 'Erreur lors de la création du ticket', 'error');
        }
    } catch (e: any) {
        toast.show(e.message || 'Une erreur est survenue', 'error');
    } finally {
        loading.value = false;
    }
};
</script>
