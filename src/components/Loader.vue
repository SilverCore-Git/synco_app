<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-(--bg) select-none">
    <div class="relative flex items-center justify-center">
      
      <div class="absolute w-20 h-20 border-2 border-(--primary)/10 rounded-full"></div>
      <div class="absolute w-20 h-20 border-t-2 border-(--primary) rounded-full animate-spin"></div>
      
    </div>

  </div>
</template>

<style scoped>
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>