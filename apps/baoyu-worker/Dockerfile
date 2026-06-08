FROM oven/bun:1

ENV NODE_ENV=production
ENV BAOYU_WORKER_DATA_DIR=/data
ENV BAOYU_CHROME_PROFILE_DIR=/data/chrome-profile
ENV PORT=8787
ENV HOST=0.0.0.0
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json bun.lockb ./
COPY packages ./packages
COPY skills ./skills
COPY apps/baoyu-worker ./apps/baoyu-worker
COPY scripts/install-skill-script-deps.mjs ./scripts/install-skill-script-deps.mjs

RUN bun install
RUN bun scripts/install-skill-script-deps.mjs

EXPOSE 8787

CMD ["bun", "apps/baoyu-worker/src/server.ts"]
