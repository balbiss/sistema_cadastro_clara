import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Clara Cadastros (sistema separado do CRM). Em local a API roda em :3013.
export default defineConfig({
  server: { port: 5185, strictPort: true, proxy: { '/api': 'http://localhost:3013' } },
  plugins: [react()],
})
