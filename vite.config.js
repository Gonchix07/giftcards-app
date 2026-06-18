import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()], // basicSsl -> HTTPS con certificado autofirmado
  server: {
    host: true, // expone el server en la red local (0.0.0.0) -> accesible por IP
    port: 5173,
    https: true,
  },
  preview: {
    host: true,
    port: 4173,
    https: true,
  },
})
