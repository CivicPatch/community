# Playwright with browsers baked in — including a real WebKit build, the engine
# family behind iOS Safari. We drive WebKit (not Chromium) on purpose: Chromium
# viewport-emulation does NOT reproduce Safari-only rendering bugs, which is the
# whole point of debugging an iPhone issue.
FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /shot
COPY package.json ./
RUN npm install
COPY screenshot.mjs ./
