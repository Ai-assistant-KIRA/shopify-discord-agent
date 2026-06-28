FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shopify-mcp-server.mjs ./
COPY lib ./lib
COPY tools ./tools
COPY scripts/discord-bridge.mjs ./scripts/
COPY scripts/import-workflow.mjs ./scripts/
COPY n8n-workflows ./n8n-workflows

EXPOSE 3000

CMD ["node", "shopify-mcp-server.mjs"]