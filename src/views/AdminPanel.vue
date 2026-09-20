<template>
  <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text) font-sans">

    <!-- Top Navigation -->
    <nav class="shrink-0 z-50 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-4">
          <router-link to="/" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors">
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
        <router-link to="/root/users" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-(--text)/5 text-(--text) hover:bg-(--text)/10">
            <i class="bi bi-people-fill"></i> Utilisateurs
        </router-link>
        <router-link to="/root/orgs" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-(--text)/5 text-(--text) hover:bg-(--text)/10">
            <i class="bi bi-building-fill"></i> Organisations
        </router-link>
      </div>
    </nav>

    <main class="flex-1 min-h-0 overflow-y-auto">
      <div class="max-w-7xl mx-auto p-6 mt-4">
        <router-view></router-view>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Admin layout - child routes are rendered in <router-view>
</script>
