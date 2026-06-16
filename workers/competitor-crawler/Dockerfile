FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    COMPETITOR_CRAWL_MODE=worker \
    COMPETITOR_BROWSER_CRAWL=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["npm", "run", "worker:competitor-crawler"]
