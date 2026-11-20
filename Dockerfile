FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi \
    && npm ci --no-audit --no-fund
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GEORISK_DB_PATH=/var/lib/georisk/georisk.db
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi \
    && pip install --disable-pip-version-check --no-cache-dir -r requirements.txt \
    && mkdir -p /var/lib/georisk /app/backend/models \
    && chown 10001:10001 /var/lib/georisk
COPY backend/app.py backend/web.py ./
COPY backend/ml ./ml
COPY --from=frontend /build/dist /app/frontend/dist
RUN chmod -R a+rX /app
USER 10001:10001
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn web:app --host 0.0.0.0 --port \"${PORT:-8080}\""]
