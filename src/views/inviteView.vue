<template>

    <div class="w-full h-full bg-(--bg1) text-(--text) flex flex-col items-center justify-center">

        <div
            class="
                bg-(--bg2) p-10  rounded-2xl 
                border-2 border-dashed  gap-4
                border-(--primary)/50 min-w-1/3 min-h-1/2 
                max-w-md text-center shadow-2xl
                flex flex-col items-center justify-center
            "
        >
            
            <div v-if="loading" class="flex flex-col items-center gap-10">
                <spin-loader />
                <p>Vérification de l'invitation...</p>
            </div>

            <div 
                v-else-if="error" 
                class="flex flex-col items-center gap-4"
            >

                <div class="text-red-500 text-5xl">⚠️</div>
                <h1 class="text-2xl font-bold">Invitation invalide</h1>
                <p class="text-sm text-(--text)/60">{{ error }}</p>

                <router-link to="/"><button class="default-primary mt-2">
                    Retour à l'accueil
                </button></router-link>

            </div>

            <div 
                v-else-if="inviteData" 
                class="flex flex-col items-center gap-4"
            >

                <div 
                    class="
                        w-20 h-20 rounded-2xl border-4 border-(--text)/40 
                        flex flex-col items-center justify-center
                    "
                >

                    <img 
                        v-if="inviteData.organizationLogo && inviteData.organizationLogo.startsWith('http')" 
                        :src="inviteData.organizationLogo" 
                        :alt="inviteData.organizationName" 
                        class="w-full h-full object-cover"
                    />

                    <i
                        v-else-if="inviteData.organizationLogo"
                        class="bi text-5xl"
                        :class="inviteData.organizationLogo"
                    />

                </div>

                <h1 class="text-2xl font-bold">Vous êtes invité à rejoindre</h1>
                <p class="text-xl font-semibold text-(--primary)">{{ inviteData.organizationName }}</p>
                
                <p class="text-sm text-(--text)/60 mt-2">
                    Cliquez ci-dessous pour accepter l'invitation et rejoindre l'équipe.
                </p>

                <button 
                    @click="acceptInvite"
                    :disabled="accepting"
                    class="primary mt-2"
                >
                    {{ accepting ? 'Acceptation...' : 'Rejoindre l\'organisation' }}
                </button>

            </div>

        </div>

    </div>

</template>

<script lang="ts" setup>

import sfetch from '@/assets/utils/sfetch';
import SpinLoader from '@/components/SpinLoader.vue';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';


const props = defineProps<{
    code: string;
}>();


const router = useRouter();

const loading = ref<boolean>(true);
const accepting = ref<boolean>(false);
const error = ref<string | null>(null);
const inviteData = ref<any>(null);


onMounted(async () => {

    try {

        const res = await sfetch('/api/orgs/users/inviteLink/check', {
            method: 'POST',
            body: JSON.stringify({ code: props.code })
        }).then(res => res.json());

        if (res.error || !res.valid)
        {
            throw new Error(res.error);
        }

        inviteData.value = res;

    } 
    catch (err: any) {
        error.value = err.response?.data?.error || "Le lien est expiré ou invalide.";
    }
    finally {
        loading.value = false;
    }

});

const acceptInvite = async () => {
    
    accepting.value = true;

    try {

        const res = await sfetch('/api/orgs/users/inviteLink/accept', {
            method: 'POST',
            body: JSON.stringify({ code: props.code })
        }).then(res => res.json());

        if (res.error && res.error != 'Already a member')
        {
            throw new Error(res.error);
        }

        setTimeout(() => {
            router.push('/');
        }, 500)

    } 
    catch (err: any) {
        accepting.value = false;
        error.value = "Erreur lors de l'acceptation de l'invitation.";
    }

};
</script>