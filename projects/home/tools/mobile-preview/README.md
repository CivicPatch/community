# mobile-preview — a debug harness, **not** the app

> ⚠️ This folder does **not** run the project. It is a throwaway tool that loads
> the hangout page in a headless mobile-viewport browser to debug the
> "blank grid on mobile" issue. The real app is a static Vite site:
> `npm run dev` (from `projects/home`) for local, GitHub Pages in production.

## What it does

`docker-compose.mobile-preview.yml` brings up two short-lived containers:

1. **site** — builds `projects/home` and serves the static bundle (`vite preview`).
2. **shot** — Puppeteer + headless Chrome emulating a 390×844 phone. It opens
   `/hangout/`, auto-fills the join gate, screenshots the grid, and prints the
   grid's measured cell size so we can see whether the cells collapse to 0.

## Run

```sh
cd projects/home/tools/mobile-preview
docker compose -f docker-compose.mobile-preview.yml up --build --abort-on-container-exit
```

Results:

- `out/01-initial.png` — first paint (usually the join modal)
- `out/02-after-join.png` — full page after joining
- `out/03-chat-grid.png` — just the `<chat-grid>` element
- container logs — sizing diagnostics + a blank/not-blank verdict

Tear down (also removes the named build/deps volumes):

```sh
docker compose -f docker-compose.mobile-preview.yml down -v
```

## Why it's named this way

The file is `docker-compose.mobile-preview.yml` (not the default
`docker-compose.yml`), lives in its own `tools/` subfolder, and sets
`name: home-mobile-preview` so its containers are prefixed `home-mobile-preview-*`.
That keeps it from being mistaken for "the stack that runs the project."
