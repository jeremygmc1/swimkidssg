# Playwright's official image ships Chromium and all its system deps at a pinned
# version — keep this tag in sync with the playwright-core version in package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# Install only production deps (playwright-core + express); the browser is already
# in the base image, so skip the browser download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
