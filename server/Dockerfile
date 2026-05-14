# Reference deployable for the LensPDF separations / densitometer /
# TAC backend. Multi-stage so the runtime image stays small (Node +
# Ghostscript only — no toolchain).

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ghostscript \
 && rm -rf /var/lib/apt/lists/*

# Non-root runtime user.
RUN useradd --system --uid 1001 --user-group lens \
 && mkdir -p /var/lib/lens-pdf/jobs /var/cache/lens-pdf \
 && chown -R lens:lens /var/lib/lens-pdf /var/cache/lens-pdf

WORKDIR /app
COPY --from=build --chown=lens:lens /app/node_modules ./node_modules
COPY --from=build --chown=lens:lens /app/dist ./dist
COPY --from=build --chown=lens:lens /app/package.json ./

USER lens
ENV NODE_ENV=production \
    PORT=3000 \
    LENS_JOBS_DIR=/var/lib/lens-pdf/jobs \
    LENS_CACHE_DIR=/var/cache/lens-pdf

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
