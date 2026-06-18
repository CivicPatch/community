// Build-time prerender of the Feeds list into static HTML, so the homepage works
// with zero JavaScript. Reads feeds.json FROM DISK (no HTTP fetch — there's no
// browser here), renders the pure lit template with lit-ssr, and writes the result
// to a partial that index.html includes. Run before `vite dev` / `vite build`.
//
// Vite's ssrLoadModule loads the TS lit template (transpile + resolve 'lit') without
// needing a separate TS runner; @lit-labs/ssr turns the template into an HTML string.

import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { render } from '@lit-labs/ssr'
import { collectResult } from '@lit-labs/ssr/lib/render-result.js'

// generated build artifact (gitignored); injected into index.html at <!--feeds-->
const OUT = 'src/_feed.generated.html'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  // we only ssrLoadModule one file — skip the client dep scan (it races server close)
  optimizeDeps: { noDiscovery: true },
  logLevel: 'warn',
})
try {
  const { feedTemplate } = await vite.ssrLoadModule('/src/feed.ts')
  const data = JSON.parse(readFileSync('public/feeds.json', 'utf8'))
  const html = await collectResult(render(feedTemplate(data)))
  writeFileSync(OUT, html)
  console.log(`prerendered ${data.entries?.length ?? 0} feed entries → ${OUT}`)
} finally {
  await vite.close()
}
