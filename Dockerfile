# Container image for persistent-disk hosts (Render, Railway, Fly.io, any VPS).
# This app runs unchanged here — it uses a local libSQL file on a mounted volume.
FROM node:22-slim

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

# Persist the database and uploaded images on a mounted volume.
ENV DATABASE_URL=file:/data/app.db
ENV UPLOADS_DIR=/data/uploads
VOLUME ["/data"]

EXPOSE 3000

# Seed on first boot (idempotent: only fills an empty DB / creates the admin),
# then start the server.
CMD ["sh", "-c", "node src/seed.js && node server.js"]
