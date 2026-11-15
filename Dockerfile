# syntax=docker/dockerfile:1

# ---- build ----
FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g corepack@latest && corepack enable

# Dependencies first, so this layer is cached until the lockfile changes.
# --ignore-scripts: the postinstall (`nuxt prepare`) needs the sources, and `nuxt build` runs it anyway.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nuxtrc ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

# ---- runtime ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output
RUN mkdir -p /app/.data && chown node:node /app/.data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
