# tools/browser — browser integration tests

Playwright integration tests that drive a **real browser** (WebKit, the engine behind
iOS Safari) against the **production build** of the site. Playwright builds the app and
serves the bundle itself, then runs the specs in `tests/`.

This is where page-level browser tests live — add a `tests/<page>.spec.ts` per page.

## Tests

- `tests/home-nojs.spec.ts` — the homepage works with **JavaScript disabled** (feed,
  onboarding, links are real prerendered HTML); with JS, times upgrade to relative.
- `tests/hangout.spec.ts` — the hangout grid renders with correctly-sized cells at a
  mobile viewport after joining (guards the iOS-Safari "blank/collapsed grid" bug).

## Run

Locally (installs the browser once):

```sh
cd projects/home
npx playwright install webkit
npm run test:e2e
```

No local browsers? Use the container (Playwright's image ships them):

```sh
cd projects/home/tools/browser
docker compose run --rm tests
```

Both build the real bundle (`npm run build`, which prerenders the feed), serve it on
:4173, and run the specs against it.
