import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Inject the lit-ssr-prerendered feed (built by scripts/prerender.mjs) into the
// homepage at the <!--feeds--> marker, via Vite's official transformIndexHtml hook —
// so the feed is real HTML that works with zero JS. Pages without the marker (the
// hangout) pass through untouched.
function injectFeed(): Plugin {
  return {
    name: 'inject-feed',
    transformIndexHtml(html) {
      if (!html.includes('<!--feeds-->')) return html
      const feed = readFileSync(resolve(process.cwd(), 'src/_feed.generated.html'), 'utf8')
      return html.replace('<!--feeds-->', feed)
    },
  }
}

// Multi-page build. Without an explicit input map, Vite builds only the root
// index.html; we also ship the hangout app at /hangout/. Deploy base is "/"
// (custom domain via public/CNAME), so absolute asset + config URLs resolve fine.
export default defineConfig({
  plugins: [injectFeed()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        hangout: 'hangout/index.html',
      },
    },
  },
})
