import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  root: 'apps/desktop/renderer',
  build: {
    outDir: '../../../dist/renderer',
    emptyOutDir: true,
  },
})
