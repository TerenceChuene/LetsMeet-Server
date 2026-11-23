# Development / production base image (Phase 1 scaffold; hardened in Phase 8)
FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
