# Build context is THIS folder only (services/renderer/). The main app is never
# part of the image — that is what keeps the deployment separate.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Install deps first for better layer caching. pnpm-workspace.yaml is copied so
# pnpm treats this dir as its own standalone root (not the app's workspace).
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
RUN pnpm install --prod=false

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Drop root for the running process.
USER node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
EXPOSE 8080
CMD ["node", "dist/index.js"]
