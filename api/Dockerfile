FROM node:20-alpine AS build
WORKDIR /app

# argon2 is a native addon — needs python3 + build tools to compile.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
# Generate Prisma client then compile TypeScript.
# Use tsc directly — nest build's deleteOutDir + incremental cache can
# silently skip output inside Docker's layer cache.
RUN npx prisma generate && \
    npx tsc --project tsconfig.build.json

# ---------------------------------------------------------------------------
FROM node:20-alpine
WORKDIR /app

# Copy everything including node_modules (prisma CLI is a dev dep needed
# by `prisma migrate deploy` in the entrypoint).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

# entrypoint.sh: migrate → seed (idempotent) → start.
# DB must be healthy before this container starts — see depends_on in
# docker-compose.prod.yml.
CMD ["./entrypoint.sh"]
