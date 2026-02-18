<script setup lang="ts">
import { ClerkLoaded, ClerkLoading, SignedIn, SignedOut } from '@clerk/vue';
import SignIn from './views/auth/SignIn.vue';
import Loader from './components/Loader.vue';

</script>

<template>

  <div
    class="w-screen h-screen relative"
  >

    <div>
      <!-- top bar for desktop app -->
    </div>
    
    <ClerkLoaded>

      <SignedIn>
        <RouterView />
      </SignedIn>

      <SignedOut>
        <SignIn />
      </SignedOut>

    </ClerkLoaded>

    <ClerkLoading>
      <Loader />
    </ClerkLoading>

  </div>

</template>