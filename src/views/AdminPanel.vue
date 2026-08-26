<template>
  <div class="min-h-screen bg-(--bg2) text-(--text) font-sans">
    
    <!-- Top Navigation -->
    <nav class="sticky top-0 z-50 bg-(--bg)/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-4">
          <router-link to="/" class="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <i class="bi bi-arrow-left text-xl"></i>
          </router-link>
          <div>
            <h1 class="text-xl font-black uppercase tracking-wider flex items-center gap-3">
              Panel admin
            </h1>
          </div>
        </div>
      </div>
      <div class="max-w-7xl mx-auto flex items-center gap-2 mt-6">
        <router-link to="/root/users" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-white/5 text-(--text) hover:bg-white/10">
            <i class="bi bi-people-fill"></i> Utilisateurs
        </router-link>
        <router-link to="/root/orgs" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-white/5 text-(--text) hover:bg-white/10">
            <i class="bi bi-building-fill"></i> Organisations
        </router-link>
        <router-link to="/root/support" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-white/5 text-(--text) hover:bg-white/10">
            <i class="bi bi-headset"></i> Support
        </router-link>
      </div>
    </nav>

    <main :class="$route.name === 'AdminSupport' ? 'p-0 w-full h-[calc(100vh-130px)]' : 'max-w-7xl mx-auto p-6 mt-4'">
      <router-view class="h-full"></router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
const $route = useRoute();
</script>
