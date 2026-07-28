import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// No default `test.environment`: DOM specs opt in per-file via `// @vitest-environment happy-dom`.
export default defineConfig({
  plugins: [vue()],
})
