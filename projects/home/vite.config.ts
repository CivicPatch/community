import { defineConfig } from 'vite'

// Multi-page build. Without an explicit input map, Vite builds only the root
// index.html; we also ship the hangout app at /hangout/. Deploy base is "/"
// (custom domain via public/CNAME), so absolute asset + config URLs resolve fine.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        hangout: 'hangout/index.html',
      },
    },
  },
})
