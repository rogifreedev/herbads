FROM mcr.microsoft.com/playwright:v1.61.0-noble

ARG HERBADS_REPO_URL=https://github.com/rogifreedev/herbads.git
ARG HERBADS_REF=main

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    COMPETITOR_CRAWL_MODE=worker \
    COMPETITOR_BROWSER_CRAWL=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "$HERBADS_REF" "$HERBADS_REPO_URL" /app

RUN npm ci --omit=dev

CMD ["npm", "run", "worker:competitor-crawler"]
