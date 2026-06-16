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

Important: this folder is a start point inside the Herbads repository. The full repository must be present on the server because the Docker build uses shared code from `lib/` and `workers/`.

The real `.env` should sit next to this file:

```text
deploy/competitor-crawler/.env
```

It is intentionally git-ignored because it contains `SUPABASE_SERVICE_ROLE_KEY`.
