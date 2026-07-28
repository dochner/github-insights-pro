<script setup lang="ts">
defineProps<{
  value: string | number
  label: string
}>()
</script>

<template>
  <div class="stat-card p-5">
    <p class="stat-value font-mono text-3xl leading-none">{{ value }}</p>
    <p class="stat-label mt-2 font-sans text-xs uppercase tracking-wide">{{ label }}</p>
  </div>
</template>

<style scoped>
.stat-card {
  border: 1px solid var(--hairline);
}

.stat-value {
  color: var(--paper);
}

.stat-label {
  color: rgb(from var(--paper) r g b / 60%);
}
</style>
