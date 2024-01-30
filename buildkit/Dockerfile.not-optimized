FROM node:20

RUN apt-get update && apt-get install -y ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN rm -rf node_modules &&  pnpm install --frozen-lockfile --prod
ENV NODE_ENV production
CMD ["node", "./build/server.js"]
