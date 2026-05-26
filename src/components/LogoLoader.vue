<template>

  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-(--bg) select-none">
    
    <div class="relative flex items-center justify-center overflow-hidden rounded-xl">

      <img src="/favicon.ico" alt="Logo" class="h-20 relative z-10" />
      
      <div class="shimmer absolute inset-0 z-20 pointer-events-none" />

    </div>

  </div>

</template>

<style scoped>

.shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.464) 50%,
    transparent 100%
  );
  
  animation: shine 3s infinite linear;
  transform: translateX(-100%);
}

@keyframes shine {
  0% {
    transform: translateX(-100%) skewX(-20deg);
  }
  100% {
    transform: translateX(100%) skewX(-20deg);
  }
}

</style>