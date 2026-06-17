# tarmac-renderer

Stateless document renderer for the resume/cover-letter export pipeline. Turns
fully-compiled HTML into downloadable bytes (PDF today; DOCX scaffolded). It is
the renderer service from the [download/export plan](../../docs/download-export-plan.md)
(§2 Q1, §11.2).

It **never** touches the database or auth — Convex/SvelteKit own persistence and
ownership. This service receives `{ format, html, ... }` and returns bytes.

## Why this lives in the same repo but is fully isolated

This is **not** a monorepo package. It is a standalone project that happens to
sit in `services/renderer/`:

- Its own `package.json` + `pnpm-lock.yaml` → its own `node_modules`. App deps
  and renderer deps never mix.
- Its own `pnpm-workspace.yaml` (declaring no packages) stops pnpm from
  attaching it to the app's workspace at the repo root, so `pnpm install` here
  is self-contained.
- The app talks to it **only over HTTP** (via `src/lib/server/render/` in the
  app). Nothing is imported across the boundary, so the SvelteKit/Vite build
  can't pull in a single renderer dependency.
- The Docker build context is this folder only — the image contains the
  renderer and nothing from the app.

To extract into its own repo later: `git subtree split --prefix=services/renderer`
(or `git filter-repo --subdirectory-filter services/renderer`). No app code
changes — the app already references this only by URL + shared secret.

## Architecture

```
SvelteKit/Convex ──HTTP──> tarmac-renderer (Hono) ──HTTP──> Gotenberg (Chromium + LibreOffice)
                            └ docxtemplater (in-process, high-fidelity DOCX) [future]
```

Gotenberg is the heavy rendering engine (headless Chromium for HTML→PDF, and
LibreOffice for the HTML→DOCX strategy). The Hono service is the API layer that
adds auth, validation, retries, a stable versioned contract, and will host the
docxtemplater strategy.

## Endpoints

| Method | Path          | Auth   | Description                          |
| ------ | ------------- | ------ | ------------------------------------ |
| GET    | `/health`     | none   | Liveness probe                       |
| POST   | `/v1/render`  | Bearer | Render HTML → bytes                  |

### `POST /v1/render`

Header: `Authorization: Bearer <RENDERER_SHARED_SECRET>`

```jsonc
{
  "format": "pdf",                 // 'pdf' | 'docx'
  "html": "<!doctype html>...",    // fully-compiled template + data
  "fileName": "jane-doe-resume.pdf",
  "pdfOptions": {                   // optional, pdf only
    "printBackground": true,
    "preferCssPageSize": true,
    "marginTop": "0", "marginBottom": "0"
  }
  // docx: "renderStrategy": "libreoffice" | "docxtemplater"  (not implemented yet)
}
```

Success → `200` with the binary body and `Content-Type`/`Content-Disposition`.
Failure → JSON `{ "error": { "code", "message", "details?" } }`. `502` upstream
errors are transient and safe for the caller to retry with backoff.

## Local development

```bash
cd services/renderer
pnpm install
cp .env.example .env            # set RENDERER_SHARED_SECRET; GOTENBERG_URL=http://localhost:3000

# Run Gotenberg locally (separate terminal):
docker run --rm -p 3000:3000 gotenberg/gotenberg:8

pnpm dev                        # tsx watch on :8080
```

Or run the whole topology with Docker:

```bash
RENDERER_SHARED_SECRET=dev-secret docker compose up --build
```

Smoke test:

```bash
curl -sS localhost:8080/health
curl -sS -X POST localhost:8080/v1/render \
  -H "authorization: Bearer dev-secret" \
  -H "content-type: application/json" \
  -d '{"format":"pdf","html":"<h1>Hello</h1>"}' --output out.pdf
```

## Environment

| Var                      | Required | Default                 | Notes                                  |
| ------------------------ | -------- | ----------------------- | -------------------------------------- |
| `PORT`                   | no       | `8080`                  | Listen port                            |
| `RENDERER_SHARED_SECRET` | **yes**  | —                       | Must match the app's value             |
| `GOTENBERG_URL`          | **yes**  | —                       | Base URL of the Gotenberg sidecar      |
| `GOTENBERG_TIMEOUT_MS`   | no       | `30000`                 | Per-call wall-clock budget             |

## Deploy (Railway)

Two services on one project (mirrors `docker-compose.yml`):

1. **gotenberg** — deploy image `gotenberg/gotenberg:8`. Keep it private (no
   public domain); other services reach it on the internal network.
2. **renderer** — deploy from this repo with **Root Directory =
   `services/renderer`** so Railway builds only this folder via its Dockerfile.
   Set `RENDERER_SHARED_SECRET` and `GOTENBERG_URL` (the gotenberg service's
   internal URL, e.g. `http://gotenberg.railway.internal:3000`).

Bound spend per plan §12.2: cap replicas and enable sleeping; watch the
`export_build_*` PostHog volume/latency to right-size.
```
