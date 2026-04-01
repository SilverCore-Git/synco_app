<script setup lang="ts">
    import { useRouter } from "vue-router";
    import { onMounted } from "vue";
    import { register } from "@teamhanko/hanko-elements";

    const hankoApi = import.meta.env.VITE_HANKO_API_URL;
    const router = useRouter();

    const redirectAfterLogin = () => {
        // Redirige l'utilisateur vers le dashboard ou l'accueil
        router.push("/");
    };

    onMounted(async () => {
        try {
            await register(hankoApi);
        } catch (error) {
            console.error("Hanko registration failed:", error);
        }
    });
</script>

<template>
    <div class="auth-container">
        <hanko-auth 
            @onSessionCreated="redirectAfterLogin" 
            @onAuthFlowCompleted="redirectAfterLogin" 
        />
    </div>
</template>

<style scoped>
/* Hanko fournit des Shadow DOM, mais tu peux styliser le container */
.auth-container {
    display: flex;
    justify-content: center;
    padding-top: 2rem;
}
</style>