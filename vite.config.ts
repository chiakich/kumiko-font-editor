import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PYODIDE_ASSET_FILES = [
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
]

const pyodidePackageDir = fileURLToPath(
  new URL('./node_modules/pyodide', import.meta.url)
)

const pyodideAssetsPlugin = (): Plugin => ({
  name: 'kumiko-pyodide-assets',
  configureServer(server) {
    server.middlewares.use('/pyodide', (request, response, next) => {
      const requestedFile = request.url?.replace(/^\/+/, '') ?? ''

      if (!PYODIDE_ASSET_FILES.includes(requestedFile)) {
        next()
        return
      }

      response.end(readFileSync(join(pyodidePackageDir, requestedFile)))
    })
  },
  generateBundle() {
    for (const fileName of PYODIDE_ASSET_FILES) {
      this.emitFile({
        type: 'asset',
        fileName: `pyodide/${fileName}`,
        source: readFileSync(join(pyodidePackageDir, fileName)),
      })
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr(), pyodideAssetsPlugin()],
  resolve: {
    alias: {
      src: fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
