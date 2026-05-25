# ── Etapa 1: Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Variables de entorno bakeadas en tiempo de build (Vite las incrusta en el JS)
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_USERS_BASE
ARG VITE_ATTEMPTS_BASE
ARG VITE_EXAMS_BASE

ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_USERS_BASE=$VITE_USERS_BASE
ENV VITE_ATTEMPTS_BASE=$VITE_ATTEMPTS_BASE
ENV VITE_EXAMS_BASE=$VITE_EXAMS_BASE

RUN npm run build

# ── Etapa 2: Serve ────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
