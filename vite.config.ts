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

const PYODIDE_CONTENT_TYPES: Record<string, string> = {
  'pyodide.asm.js': 'application/javascript; charset=utf-8',
  'pyodide.asm.wasm': 'application/wasm',
  'pyodide-lock.json': 'application/json; charset=utf-8',
  'python_stdlib.zip': 'application/zip',
}

const pyodidePackageDir = fileURLToPath(
  new URL('./node_modules/pyodide', import.meta.url)
)

const pyodideAssetsPlugin = (): Plugin => ({
  name: 'kumiko-pyodide-assets',
  configureServer(server) {
    server.middlewares.use('/pyodide', (request, response, next) => {
      const requestedPath = new URL(request.url ?? '', 'http://localhost')
        .pathname
      const requestedFile = requestedPath.replace(/^\/+/, '')

      if (!PYODIDE_ASSET_FILES.includes(requestedFile)) {
        next()
        return
      }

      response.statusCode = 200
      response.setHeader(
        'Content-Type',
        PYODIDE_CONTENT_TYPES[requestedFile] ?? 'application/octet-stream'
      )
      response.setHeader('Cache-Control', 'no-cache')
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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      src: fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
