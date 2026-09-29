import { spawn, type ChildProcess } from 'node:child_process'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

// `npm run dev` also starts the TeX compile companion (same as `npm run compile-server`).
// Set NO_COMPILE_SERVER=1 to skip it, e.g. when running it separately.
function compileServer(): Plugin {
  let child: ChildProcess | undefined
  const stop = () => { child?.kill(); child = undefined }
  return {
    name: 'compile-server',
    apply: 'serve',
    configureServer(server) {
      if (process.env.NO_COMPILE_SERVER || child) return
      child = spawn(process.execPath, ['server/setup-tex.mjs', '--serve'], {
        // stdin stays with Vite so its keyboard shortcuts keep working
        stdio: ['ignore', 'inherit', 'inherit'],
      })
      child.on('exit', (code) => {
        if (code) server.config.logger.warn(`[compile-server] exited with code ${code}`)
        child = undefined
      })
      server.httpServer?.on('close', stop)
      process.on('exit', stop)
    },
  }
}

export default defineConfig({
  plugins: [vue(), compileServer()],
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
