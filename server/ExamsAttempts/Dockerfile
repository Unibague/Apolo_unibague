# Multi-stage build — imagen final ligera (~150MB) sin devDependencies

# ─── Stage 1: builder ───
FROM node:20-alpine AS builder
WORKDIR /app

# bcrypt necesita herramientas nativas para compilar
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev

# ─── Stage 2: runner ───
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Crea la carpeta de uploads dentro del container (montada como volumen)
RUN mkdir -p /app/uploads/answers

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3002

CMD ["node", "dist/server.js"]
