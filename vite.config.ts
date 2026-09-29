import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  base: './',
  // mathjax-full (used by Penrose for labels) expects a build-time constant
  define: { PACKAGE_VERSION: JSON.stringify('3.2.1') },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@penrose')) return 'penrose'
          if (id.includes('/codemirror') || id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
          if (id.includes('jspdf') || id.includes('svg2pdf')) return 'pdf'
          if (id.includes('/katex/')) return 'katex'
          if (id.includes('examples.json')) return 'examples'
          return undefined
        },
      },
    },
  },
})
