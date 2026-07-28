<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: string // "owner/repo"
}>()

const emit = defineEmits<{
  select: [owner: string, repo: string]
}>()

const draft = ref(props.modelValue)
const validationError = ref<string | null>(null)

// Honest, minimal validation: shape-check only, not a real GitHub existence check (that happens on submit, via the fetch itself).
const OWNER_REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

function onSubmit(): void {
  const trimmed = draft.value.trim()
  if (trimmed.length === 0) {
    validationError.value = 'Enter a repository as owner/repo.'
    return
  }
  if (!OWNER_REPO_PATTERN.test(trimmed)) {
    validationError.value = 'Expected the shape "owner/repo", e.g. vuejs/core.'
    return
  }
  validationError.value = null
  const [owner, repo] = trimmed.split('/') as [string, string]
  emit('select', owner, repo)
}
</script>

<template>
  <form class="flex items-center gap-2" @submit.prevent="onSubmit">
    <label for="repo-selector-input" class="sr-only">Repository (owner/repo)</label>
    <input
      id="repo-selector-input"
      v-model="draft"
      type="text"
      inputmode="text"
      spellcheck="false"
      placeholder="owner/repo"
      class="repo-input font-mono text-sm"
      :aria-invalid="validationError !== null"
      aria-describedby="repo-selector-error"
    />
    <button type="submit" class="repo-submit font-sans text-sm">Load</button>
    <p v-if="validationError" id="repo-selector-error" role="alert" class="repo-error font-sans text-xs">
      {{ validationError }}
    </p>
  </form>
</template>

<style scoped>
.repo-input {
  background: transparent;
  color: var(--paper);
  border: 1px solid var(--hairline);
  padding: 0.4rem 0.6rem;
  min-width: 14rem;
}

.repo-input:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}

.repo-submit {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--hairline);
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}

.repo-submit:hover,
.repo-submit:focus-visible {
  border-color: var(--accent);
}

.repo-error {
  color: var(--red);
}
</style>
