# Competitor Crawler Deploy Folder

Start the Docker worker from this folder:

```bash
cd deploy/competitor-crawler
docker compose up -d --build
docker compose logs -f competitor-crawler
```

Health endpoint:

```bash
curl http://localhost:39123/healthz
```

This folder can be uploaded as a standalone deploy folder. The Dockerfile clones the Herbads repo during build using:

```text
HERBADS_REPO_URL=https://github.com/rogifreedev/herbads.git
HERBADS_REF=main
```

If the repo is private, set `HERBADS_REPO_URL` in `.env` to a URL that your server can access.

The real `.env` should sit next to this file:

```text
deploy/competitor-crawler/.env
```

It is intentionally git-ignored because it contains `SUPABASE_SERVICE_ROLE_KEY`.

When pulling a fresh worker build from the same branch, use `--no-cache` if Docker keeps an old git clone layer:

```bash
docker compose build --no-cache
docker compose up -d
```
