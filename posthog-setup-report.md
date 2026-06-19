<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into your Resume Tailor SvelteKit application. Here's what was set up:

- **Client-side PostHog** initialized in `src/hooks.client.ts` with a reverse proxy (`/ingest`), session replay support, and automatic exception capture.
- **Server-side PostHog** singleton in `src/lib/server/posthog.ts` using `posthog-node`, with flush-on-write for serverless-safe event delivery.
- **Reverse proxy** in `src/hooks.server.ts` (routes `/ingest/*` and `/ingest/static|array/*` to PostHog CDN) via `sequence()` alongside the existing Clerk handler, to prevent ad blocker interference.
- **Server error tracking** via `handleError` on both client and server hooks.
- **User identification** in `src/routes/+page.svelte` — when Clerk session is established, `posthog.identify()` is called with the Clerk user ID, email, and name.
- **`paths.relative: false`** added to `svelte.config.js` (required for session replay with SSR).
- **Environment variables** written to `.env` and gitignored.

## Events instrumented

| Event                  | Description                                                                                   | File                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `run_started`          | User submits a job description and resume to kick off a tailoring run. Core conversion event. | `src/lib/utils/startRun.ts`                           |
| `resume_uploaded`      | User's resume file finishes uploading and is marked ready.                                    | `src/lib/components/main-prompt.svelte`               |
| `instructions_added`   | User opens the tailoring instructions panel. Signals advanced usage intent.                   | `src/lib/components/main-prompt.svelte`               |
| `feedback_submitted`   | User sends a revision/feedback message within a run.                                          | `src/routes/(app)/runs/[runId]/+page.svelte`          |
| `run_resumed`          | User manually resumes a stalled or failed run.                                                | `src/routes/(app)/runs/[runId]/+page.svelte`          |
| `artifact_downloaded`  | User clicks Download on their tailored resume output. Key success signal.                     | `src/routes/(app)/runs/[runId]/+page.svelte`          |
| `run_created`          | Server-side: new run created in the API. Complements the client-side `run_started`.           | `src/routes/api/ai/runs/+server.ts`                   |
| `run_resume_requested` | Server-side: resume-run API endpoint is triggered.                                            | `src/routes/api/ai/runs/[runId]/resumeRun/+server.ts` |
| `server_error`         | Any unhandled server-side error (via `handleError` hook).                                     | `src/hooks.server.ts`                                 |

## LLM analytics (AI Observability)

PostHog LLM analytics are integrated via the Vercel AI SDK's OpenTelemetry support. Every `generateText` call in the AI workflow emits `$ai_generation` events to PostHog automatically, capturing model, token counts, latency, and costs.

### What was added

- **`@posthog/ai`**, **`@opentelemetry/sdk-node`**, **`@opentelemetry/resources`** installed.
- **`src/lib/server/otel.ts`** — initializes the `NodeSDK` with `PostHogSpanProcessor`. Imported at server startup via `hooks.server.ts`.
- **`experimental_telemetry`** added to all 5 `generateText` call sites in `src/lib/server/ai/workflow/orchestration/llm.ts`.

### Instrumented call sites

| Function                           | `functionId`                               | Description                                                      |
| ---------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `executeStructuredCall` (native)   | `resume-tailor/{role}/structured`          | Reviewer critique/plan and review phases using structured output |
| `executeStructuredCall` (prompted) | `resume-tailor/{role}/structured-prompted` | JSON-prompted structured fallback strategy                       |
| `executeFreeformCall`              | `resume-tailor/{role}/freeform`            | Writer draft and revision phases                                 |
| `executeStructuredRepairCall`      | `resume-tailor/{role}/repair-structured`   | AI-assisted repair of malformed structured output                |
| `executeFreeformRepairCall`        | `resume-tailor/{role}/repair-freeform`     | AI-assisted repair of malformed freeform text                    |
| `profileCreationInference`         | `resume-tailor/profile/inference`          | Profile creation inference                                       |

Each generation event includes `run_id`, `phase`, and `loop` as custom metadata for correlation with your Convex run records.

View live LLM generations at: https://us.posthog.com/project/471296/ai-observability/generations

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/471296/dashboard/1714286)
- [Run starts over time](https://us.posthog.com/project/471296/insights/hSDoh159) — daily active users who start a run
- [Resume tailoring conversion funnel](https://us.posthog.com/project/471296/insights/FL7sazpf) — upload → run → download
- [Feedback rounds per run](https://us.posthog.com/project/471296/insights/44pHqPan) — revision loop engagement
- [Downloads over time](https://us.posthog.com/project/471296/insights/6vgl9l7l) — final success signal
- [Run errors trend](https://us.posthog.com/project/471296/insights/XDTSRmGf) — server error monitoring
- [LLM Generations](https://us.posthog.com/project/471296/ai-observability/generations) — per-call token counts, latency, and costs

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-sveltekit/` and `.claude/skills/llm-analytics-setup/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
