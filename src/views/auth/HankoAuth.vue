<script setup lang="ts">

    import { useRouter } from "vue-router";
    import { onMounted } from "vue";
    import { register } from "@teamhanko/hanko-elements";

    const hankoApi = import.meta.env.VITE_HANKO_API_URL;
    const router = useRouter();

    const redirectAfterLogin = () => {
        router.push("/");
    };

    onMounted(() => {
        register(hankoApi)
        .catch((error) => {
            console.log(error);
        });
    });

</script>

<template>
    <hanko-auth @onSessionCreated="redirectAfterLogin" />
</template>