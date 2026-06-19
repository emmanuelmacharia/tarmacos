# Download & Export — Implementation Plan

> Status: **DRAFT for review**. No code is written yet. Once approved, we break this
> into PRs per the phasing in §10.

## 0. Goal

Let a user who is happy with a tailored resume:

1. Click **Download** → open a modal showing all available templates (thumbnails).
2. Click a template to **view a full-size, WYSIWYG preview of _their own_ resume** in that template.
3. Pick a **format** (PDF or Word) and trigger a build (`run.phase = 'finalizing'`).
4. On build completion, the file is persisted in the document store and recorded as a
   `generated_export` run document, surfaced in run history.
5. When the user actually downloads the file, `run.status = 'completed'`.
6. The whole funnel is instrumented in PostHog so we can optimise the critical path.

Plus an **internal-only** path to upload/manage templates (never shown to users).

---

## 1. What already exists (do not rebuild)

The schema and workflow were scaffolded for this feature. We are filling in stubs, not
starting fresh.

| Concern                | Already present                                                                                                                                                                            | File                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Export record table    | `exports` (runId, artifactVersionId, format, exporterVersion, `renderOptionHash`, status `pending/ready/failed`, documentId, contentHash, fileSizeBytes, mimeType) + `by_render_key` index | `src/convex/schema.ts`             |
| Export create mutation | `createExport` (links artifact final version + run final version)                                                                                                                          | `src/convex/exports/index.ts`      |
| Run document purpose   | `documentPurpose` includes `'generated_export'`                                                                                                                                            | `src/convex/lib/schemaTypes.ts`    |
| Run phase              | `runPhase` includes `'finalizing'`                                                                                                                                                         | `src/convex/lib/schemaTypes.ts`    |
| Next instruction       | `NextInstruction` includes `generate_export`; derived from `finalizing` phase                                                                                                              | `src/convex/lib/run/utils.ts`      |
| Orchestrator hook      | `handleExportInstruction` → `completeExport` (**stub**, hardcoded `format: 'pdf'`)                                                                                                         | `orchestrator.ts`, `runs/index.ts` |
| Document store         | `documents` table over Convex `_storage`, upload URL + register flow                                                                                                                       | `src/convex/documents/upload.ts`   |
| Analytics              | client `posthog-js` + server `posthog-node` (`getPostHogClient`)                                                                                                                           | `src/lib/server/posthog.ts`        |
| Download button        | UI stub firing `artifact_downloaded` only                                                                                                                                                  | `runs/[runId]/+page.svelte:367`    |

### Key gaps

- **No `templates` table** and no admin upload path.
- **Nothing transitions a run into `finalizing`** — the writer/reviewer loop ends at
  `awaiting_user`. Export is never reached today.
- **No renderer**: nothing turns `canonicalJson`/markdown into a PDF or DOCX.
- **No preview** of the resume _in a template_ (current preview is raw markdown → HTML).
- `completeExport` is a no-op; `createExport` is never called by the workflow.

---

## 2. The four architecture questions

### Q1 — Where does document generation run? Serverless vs dedicated server?

**Recommendation: a dedicated, containerised renderer service, invoked asynchronously —
not Convex actions, not the SvelteKit serverless function.**

Reasoning:

- **Convex actions can't render.** They run in a restricted V8/Node runtime with no
  Chromium and no LibreOffice binary, and have tight time/memory budgets. PDF/DOCX
  rendering needs heavy native deps. Convex stays the **system of record and orchestrator**,
  not the renderer.
- **SvelteKit serverless (adapter-auto → Vercel/Netlify functions)** can technically run
  `@sparticuz/chromium`, but: ~250MB cold-start payload, slow cold starts, function
  time limits, and it couples a bursty CPU/RAM-heavy job to our request path. Bad fit for
  a "long running, resource intensive" job by the user's own description.
- **A container that scales to zero** (Cloud Run / Fly.io / Railway) is the right home:
  no per-request cold-Chromium tax, generous timeouts, horizontal scaling under burst,
  and one place to keep the rendering toolchain.

**Renderer design — one pipeline, two outputs (this is what makes WYSIWYG cheap, see Q2):**

- Templates are **HTML + CSS** parameterised over the resume's `canonicalJson`.
- **PDF** = render that exact HTML with **headless Chromium** (Playwright/Puppeteer).
- **DOCX** = **both strategies, selectable per request** (your call, §12.1): (a) the same
  HTML → DOCX via LibreOffice headless (one template serves both formats, lower fidelity), and
  (b) a `docxtemplater` `.docx` template driven by the same `canonicalJson` (higher Word
  fidelity). The build request carries a `renderStrategy` arg so we can A/B them, gravitate to
  higher fidelity over time, and gate strategy by billing tier later.
- Concretely: **[Gotenberg](https://gotenberg.dev)** (open-source, wraps Chromium +
  LibreOffice behind an HTTP API) is the fastest path — it covers HTML→PDF (Chromium) and the
  LibreOffice DOCX strategy. The docxtemplater strategy lives in a small bespoke Node renderer
  alongside it. So the service exposes: PDF (Gotenberg/Chromium), DOCX-libreoffice (Gotenberg),
  DOCX-docxtemplater (bespoke). Same "both if the cost is fidelity" approach as DOCX (§12.3).

The renderer is **stateless**: it receives `{ templateHtml, data, format }`, returns bytes.
It never touches our DB. Convex/SvelteKit own persistence and auth.

### Q2 — How do we show a preview that truly matches the output (WYSIWYG)?

**Recommendation: shared template, no LLM in the loop.**

The "what you see is what you get" guarantee comes from the preview and the export using
the **same template applied to the same data**:

- A template is HTML/CSS over `artifactVersions.canonicalJson` (which already has typed
  sections: header/summary/experience/skills/education/…).
- **Full-size preview** = render that template **client-side in a sandboxed iframe** with
  the user's `canonicalJson`. Instant, no server round-trip, pixel-identical to what the
  PDF pipeline will produce because it is the same HTML/CSS.
- **PDF/DOCX export** = the renderer service runs the _same_ HTML through Chromium.

This sidesteps the LLM entirely for layout, so the "very high success rate" requirement is
met structurally rather than probabilistically. An LLM is only needed if templates were
free-form prose — we deliberately avoid that by making templates **data-driven**.

**Thumbnails (small previews in the grid)** = pre-rendered static PNGs of each template
filled with neutral sample data, produced once at template-publish time and stored in the
document store. Cheap to list, cheap to render.

Performance notes:

- Client-side iframe render of one resume is trivially fast; print CSS (`@page`, page-break
  rules) lives in the template so the on-screen preview shows real page breaks.
- Cache the compiled template HTML/CSS per `templateId@version` on the client.

### Q3 — What happens when generation fails? How do we re-trigger?

The `exports` row **is** the job record (status `pending → ready | failed`, plus an `error`
field we will add).

- An export failure is **not** a run failure. The resume content is fine; only rendering
  broke. So we **keep the run in `finalizing`** and surface a retryable error — we never
  flip `run.status = 'failed'` for a render error.
- **Idempotency / dedupe**: the existing `by_render_key`
  (`artifactVersionId + format + exporterVersion + renderOptionHash`) lets us find an
  existing `ready` export and return it instead of re-rendering. `renderOptionHash` =
  hash of `{ templateId, templateVersion, formatOptions }`.
- **Retry** reuses the existing resume machinery: `generate_export` is already a derivable
  instruction for a `finalizing` run, and `resetRunForResume` + `resumeWorkflow` already
  recover stalled/failed executions guarded by execution claims. A failed export → user
  clicks "Retry", which re-drives the same instruction.
- **Automatic retry**: the renderer call gets bounded retries with backoff (transient
  5xx/timeouts) inside the export action before marking the row `failed`.

### Q4 — Do we need a queue?

**Not for v1.** We already have the primitives that a queue would give us:

- The **execution-claim** mechanism (`claimInstructionExecution` /
  `releaseInstructionExecution` + stale-claim reset) already serialises work per run and
  prevents double execution.
- **Convex's scheduler** (`ctx.scheduler.runAfter`) can act as a lightweight async job
  runner / retry timer if we want to detach the build from the request.

So v1: trigger the build inline via the orchestrator (as today for the writer/review loop),
with the `exports` row as the durable job record. **Introduce a real queue** (Cloud Tasks,
or Convex scheduled functions as a queue) only when concurrent export volume threatens the
renderer — we'll watch the PostHog `export_build_*` volume/latency to decide. Designing the
export as a job-record-driven step now means adding a queue later is a swap of the
_invoker_, not a rewrite.

---

## 3. Data model changes

### 3.1 New table: `templates`

```ts
templates: defineTable({
	key: v.string(), // stable slug, e.g. "classic", "compact-senior"
	name: v.string(),
	description: v.optional(v.string()),
	templateType: artifactType, // reuse existing enum: 'resume' | 'cover_letter' | …
	category: v.optional(v.string()), // e.g. "modern", "ats-safe"
	engine: v.union(v.literal('html'), v.literal('docx')), // html = Chromium/LibreOffice pipeline
	version: v.number(), // bump on asset change; pins exporterVersion/renderKey
	status: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
	supportedFormats: v.array(exportFormat), // ['pdf','docx']
	// assets live in _storage; we keep pointers, not blobs
	templateAssetStorageId: v.id('_storage'), // HTML/CSS bundle (or docx for docxtemplater)
	thumbnailStorageId: v.optional(v.id('_storage')),
	sampleStorageId: v.optional(v.id('_storage')), // pre-rendered sample PDF (the "sample file in the document store")
	isVisible: v.boolean(), // hard gate so a published-but-hidden template never lists
	createdAt: v.number(),
	updatedAt: v.number()
})
	.index('by_key', ['key'])
	.index('by_type_status_visible', ['templateType', 'status', 'isVisible']);
```

**`templateType`** (note #1) makes the table extensible to new document kinds without
schema churn: it reuses the existing `artifactType` union (`'resume' | 'cover_letter'`), the
same enum `artifacts` already use, so cover-letter support is "add templates of that type +
filter the modal by the artifact type of the run" — no new table, no migration. The
`by_type_status_visible` index lets user-facing queries fetch only the relevant kind.

User-facing queries only ever return `templateType = <run's artifact type> AND
status = 'published' AND isVisible = true`.

### 3.2 `exports` (extend existing)

Add:

- `templateId: v.id('templates')` and `templateVersion: v.number()` (provenance + render key).
- `error: v.optional(v.any())` (failure surface for retry UI).
- `downloadedAt: v.optional(v.number())` and `downloadCount: v.number()` (drives the
  "set run completed on first download" rule and analytics).

Keep `status: 'pending' | 'ready' | 'failed'`. `documentId` points to the persisted file.

### 3.3 `documents.documentType` (extend enum)

Add `'generated_export'` to `documentType` so the produced file is a first-class document.
(`documentPurpose` already has `'generated_export'` for `runDocuments`.)

### 3.4 `userPreferences.defaultTemplateId` / `profiles.preferredTemplateId`

Already exist as `v.string()`. We'll treat them as `templates.key` and default the modal's
selection to them.

---

## 4. Run lifecycle for export

Today a run ends at `status='awaiting_user'`, `phase='user_review'`. The export feature adds
a final leg. Proposed transitions:

```
user_review / awaiting_user
   │  user opens Download modal, picks template + format, confirms build
   ▼
phase = 'finalizing', status = 'awaiting_user'     ← createExport(pending); status UNCHANGED
   │  build progress tracked by exports.status (pending → ready | failed), NOT run.status
   │  renderer produces bytes → stored → documents row + runDocuments(generated_export)
   ▼
phase = 'finalizing', status = 'awaiting_user'     ← export row 'ready'
   │  user clicks the actual Download (file transfer)
   ▼
status = 'completed', completedAt set              ← requirement #5
```

### Why `run.status` stays `awaiting_user` during the build (note #2)

I originally flipped it to `running`; that was wrong. Rationale for **not** changing it:

1. **It would re-trigger the wrong loop.** The run-detail page auto-resumes any run whose
   status is `created | running | failed` (`runs/[runId]/+page.svelte:116-122`), and
   `resumeRun` drives the **writer/reviewer orchestrator**. A `running` status during an
   export build would spuriously kick off agentic work, not the renderer.
2. **The status is redundant.** Export progress is already first-class and independently
   observable via `exports.status` (`pending → ready → failed`). The run doesn't need to
   mirror it.
3. **The agentic loop is genuinely finished.** The run is legitimately _awaiting a user
   action_ — the terminal download. `awaiting_user` is the honest state; `phase='finalizing'`
   records that the user has moved into the export leg (satisfies requirement #3 and lets the
   UI show the right state).
4. **`deriveNextInstructionForRun` already short-circuits** `awaiting_user` to `await_user`
   (`lib/run/utils.ts:72`), so keeping the status means the export never collides with the
   instruction loop.

Implication: the export build is a **standalone job** driven by its own endpoint/action and
the `exports` row — it is **not** routed through `executeLoop`. The pre-existing
`generate_export` instruction + `finalizing` derivation become unused on the happy path; we
keep them only if we later want a loop-driven export, otherwise they can be retired.

Notes:

- Requirement #3 ("phase set to finalizing", "call an api to build") → confirming the modal
  calls a build endpoint that sets `phase='finalizing'` and inserts a `pending` export.
- Requirement #5 ("export ready AND downloaded → completed") → first successful file download
  of a `ready` export flips the run terminal. Re-downloads from history do **not** change
  state (run already completed).
- A failed export keeps `finalizing` + `awaiting_user` with `exports.error` set, so Retry is
  always reachable.

---

## 5. Backend work (Convex)

1. **`templates` module** (`src/convex/templates/`):
   - `listPublishedTemplates` (query) — user-facing, filtered to visible+published, returns
     name/description/thumbnail URL/supportedFormats only.
   - `getTemplateAssets` (query/action) — returns signed URL or inline HTML/CSS for client
     preview rendering.
   - **Admin path** (`templates/admin.ts`) — `upsertTemplate`, `publishTemplate`,
     `archiveTemplate`, `setVisibility`, plus an upload-URL mutation for assets/thumbnail.
     Gated by an **admin check** (Clerk org role or a server-only admin secret), _never_
     exposed in user navigation. Designed so an external app can call it (see §7).
2. **Export build action** (`src/convex/exports/build.ts` as a Convex **action**, invoked by
   the SvelteKit build route — see §6): orchestrates create-pending → call renderer → store →
   complete, as a **standalone job** (not via `executeLoop`). Wraps `createExport`, calls the
   renderer service over HTTP with a `renderStrategy` arg (note: DOCX dual strategy, §12.1),
   stores returned bytes via `ctx.storage.store`, registers a `documents` row
   (`generated_export`), inserts `runDocuments` (`purpose: 'generated_export'`), patches
   `exports` → `ready`/`failed`.
3. **`completeExport` rewrite** (`runs/index.ts`): replace the stub. Accept `templateId`,
   `format`, and the produced `documentId`; validate ownership; set `phase='finalizing'`
   while **leaving `status='awaiting_user'`** (§4); link the final artifact version. Remove
   the hardcoded `format: 'pdf'`.
4. **`markExportDownloaded`** (mutation): increments `downloadCount`, sets `downloadedAt`,
   and on first download of a `ready` export sets `run.status='completed'`, `completedAt`.

## 6. Server / orchestration wiring

- **Build endpoint**: `POST /api/runs/[runId]/export` (SvelteKit) — authenticates, sets
  `phase='finalizing'` (status untouched, §4), inserts the `pending` export, then invokes the
  renderer. Mirrors the existing `resumeRun` route pattern and reuses `withApiErrorHandling` +
  server PostHog. Body carries `{ templateId, format, renderStrategy? }`.
- **Renderer client** (`src/lib/server/render/`): typed wrapper over the renderer HTTP API
  with bounded retry/backoff and timeout. Accepts the `renderStrategy` so we can route a DOCX
  request to either LibreOffice-from-HTML or docxtemplater (§12.1). Renderer URL/secret via env.
- Reuse execution claims (or an `exports`-row dedupe on `by_render_key`) so a double-click
  can't trigger two concurrent builds for one render key.

## 7. Internal template management (never user-visible)

- Templates are authored as an **HTML/CSS bundle** (or `.docx` for docxtemplater) +
  thumbnail + sample file.
- **Admin gate (note #4, decided)**: a **hidden route** (e.g. `/internal/templates`, no nav
  entry, robots-excluded, returns 404 to non-admins so it isn't discoverable) guarded by an
  `ADMIN_USER_IDS` env allowlist checked against the authenticated Clerk `userId`. Simple and
  good enough for now; a dedicated admin portal is explicitly out of scope. Convex admin
  mutations enforce the same check server-side (env allowlist), so the gate doesn't rely on
  the route alone.
- The "external application" you mentioned is supported by that same admin API surface
  (asset upload URL, `upsert/publish/archive` mutations) — an external caller authenticates
  as an allowlisted admin user.
- v1 can ship with templates **seeded via a script** (`convex/templates/seed.ts`) so we are
  not blocked on building the external admin UI.

## 8. Frontend work

- **Download modal** (replaces the stub button in `runs/[runId]/+page.svelte`):
  - Template grid with thumbnails (`listPublishedTemplates`).
  - "View more" → full-screen WYSIWYG preview: client-side iframe rendering the selected
    template over the current `displayedVersion.canonicalJson`.
  - Format selector (PDF / Word), gated by `template.supportedFormats`.
  - Confirm → calls the build endpoint; shows building state; on ready, a Download action.
- Built with the project's **existing shadcn-svelte components** (`src/lib/components/ui/dialog/*`,
  already in the repo) + Svelte 5 runes — we do **not** import `bits-ui` directly (note #3).
  Validate via the Svelte MCP autofixer before finalising any `.svelte`.
- **Run history** (`runs/+page.svelte` and run detail): surface `generated_export` run
  documents — show "Document generated", a view link, and a re-download action.

## 9. Failure & retry UX

- Build error → modal shows a retryable error (from `exports.error`); Retry re-invokes the
  build (idempotent via `by_render_key`; returns cached `ready` export if one exists).
- Stalled build → existing stale-claim reset frees it for resume.

## 10. PostHog analytics (requirement #6)

Funnel events (client unless noted), all carrying `run_id`, `template_id`/`template_key`,
`format` where relevant:

| Event                                                      | Fired when                            | Purpose                                                 |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `download_modal_opened`                                    | modal opens                           | top of funnel                                           |
| `template_previewed`                                       | "view more" full preview              | which templates get inspected                           |
| `template_selected`                                        | template chosen                       | preference signal                                       |
| `export_format_selected`                                   | format chosen                         | PDF vs Word demand                                      |
| `export_requested`                                         | build confirmed                       | intent → build conversion                               |
| `export_build_started` / `_succeeded` / `_failed` (server) | renderer lifecycle                    | success rate + **build latency** (critical-path timing) |
| `export_downloaded`                                        | first file download (→ run completed) | true conversion                                         |
| `export_redownloaded`                                      | download from history                 | repeat value                                            |

We already emit `artifact_downloaded` from the stub — replace/augment it with the above.
Server events go through `getPostHogClient()` with `distinctId = userId` (as `resumeRun`
does). Build the funnel `modal_opened → requested → succeeded → downloaded` in PostHog and
watch `export_build_*` volume+latency to answer the queue question (Q4) with data.

### Status (Phase 7) — analytics wired; dashboard deferred until data flows

All eight events above are emitted and verified:

- **Client (`download-modal.svelte`):** `download_modal_opened`, `template_selected`,
  `export_format_selected`, `template_previewed`.
- **Server build route (`/api/runs/[runId]/export`):** `export_requested`,
  `export_build_started`, `export_build_succeeded` (carries `build_latency_ms`),
  `export_build_failed` (carries `error_code`).
- **Server download route (`…/export/[exportId]/download`):** `export_downloaded` (first
  download → run completed) / `export_redownloaded` (subsequent), with `run_id`, `export_id`.

The PostHog **dashboard is intentionally deferred**: as of this writing none of the
`export_*` / `download_modal_opened` / `template_*` events exist in the project's data
schema (the renderer/export path hasn't produced data yet), so a dashboard built now would
be empty and unvalidatable. Create it once ≥1 real export has run and the events appear in
the schema. **Build recipe (PostHog project ResumeTailor, 471296):**

1. **Funnel — "Export & download conversion"** (`query-funnel`, ordered, 14-day window):
   `download_modal_opened` → `export_requested` → `export_build_succeeded` →
   `export_downloaded`. Answers requirement #6's critical-path conversion.
2. **Trend — "Build success rate"** (`query-trends`, daily): series A
   `export_build_succeeded` (total count), series B `export_build_failed` (total count);
   add formula `A / (A + B) * 100` for success %.
3. **Trend — "Build latency"** (`query-trends`, daily): event `export_build_succeeded`,
   property `build_latency_ms`, two series with `p50` and `p95` math. This is the signal
   that answers the queue question (Q4 / §12.2 replica cap).
4. **Trend — "PDF vs Word demand"** (`query-trends`, daily): event
   `export_format_selected`, breakdown by event property `format`.

Then `dashboard-create` "Export & Download Funnel" with the four insights. (Re-downloads:
add a `export_redownloaded` count tile if repeat-value tracking is wanted.)

---

## 11. Phasing (suggested PRs)

1. **Schema + templates backend**: `templates` table, `exports`/`documents` extensions,
   user-facing template queries, admin mutations + seed script.
2. **Renderer service**: containerised Gotenberg (or Node) renderer + typed client; PDF first.
3. **Build pipeline**: build endpoint + Convex export action + `completeExport` rewrite +
   run-state transitions + `markExportDownloaded`.
4. **Frontend modal**: template grid, WYSIWYG iframe preview, format select, build/download.
5. **DOCX format** + thumbnail/sample generation in the admin path. ✅ _Implemented:_ DOCX
   via in-process `@turbodocx/html-to-docx` (see §12.1 note); a Gotenberg Chromium
   `/v1/screenshot` route for thumbnails; an admin-gated `POST
/api/admin/templates/[id]/previews` that compiles neutral sample data
   (`src/lib/render/sample.ts`) and stores a thumbnail PNG + sample PDF via
   `templates.admin.{getTemplateForPreview,setTemplatePreviews}`.
6. **Run history surfacing** of `generated_export` + re-download. ✅ _Implemented:_
   `exports.index.listRunExports` (ready exports per run); run-detail page shows a "Files"
   panel listing generated files with re-download (via the existing download endpoint);
   `listUserRuns` returns a per-run `exportCount` surfaced as a badge on the history list.
7. **Analytics + funnel** wired across the path; dashboard in PostHog. ✅ _Implemented
   (analytics) / deferred (dashboard):_ all §10 events emit and are verified; the PostHog
   dashboard is deferred until the `export_*` events appear in the data schema — concrete
   build recipe captured in §10 "Status (Phase 7)".

---

## 12. Decisions (resolved) + remaining cost questions

1. **DOCX strategy — DECIDED: both, selectable.** Expose a `renderStrategy` arg
   (`libreoffice` | `docxtemplater`) on the build API so the server is told which to use. Run
   both, measure fidelity, gravitate to docxtemplater where it wins; may become a billing
   lever. v1 wires both behind the flag; LibreOffice is the default until docxtemplater
   templates exist.
   - **Implementation note (Phase 5):** the "LibreOffice via Gotenberg" path assumed below
     turned out **not to be buildable** — Gotenberg only _outputs_ PDF (its LibreOffice
     module converts office docs → PDF; there is no HTML→DOCX route). The default DOCX
     strategy is therefore implemented **in-process via `@turbodocx/html-to-docx`** over the
     same compiled HTML. The `renderStrategy: 'libreoffice'` id is kept for contract
     stability (the label is now historical); `docxtemplater` remains `501` until `.docx`
     template assets exist. Fidelity is basic (headings, bold/italic, lists, links, tables).
2. **Renderer host — DECIDED: Railway.** We're choosing **Railway** for the developer
   experience; the workload is low in v1 and DX/simplicity wins here. Spend is bounded with a
   **replica cap** and app **sleeping** (scale-to-zero-ish idle) so a burst can't run up the
   bill, and we watch `export_build_*` volume (§10) to right-size the cap.
   - Context for the trade-off we accepted: **Cloud Run** offers tighter cost control
     (`min-instances=0` floor + hard `max-instances` ceiling + per-instance `concurrency`). If
     export volume/latency later shows Railway's coarser knobs aren't enough, Cloud Run is the
     documented fallback — the renderer is stateless (Q1), so the host is a swap, not a rewrite.
3. **Renderer engine — Gotenberg first, bespoke where fidelity costs.** Gotenberg covers
   HTML→PDF and LibreOffice DOCX out of the box (minimal code, one container). Its drawback is
   exactly the fidelity ceiling you anticipated: it's a wrapper, so fine-grained DOCX styling
   and conditional logic are limited — which is why the **docxtemplater** strategy sits beside
   it for the high-fidelity path. Same "do both if the cost is fidelity" stance as §12.1.
4. **Admin gate — DECIDED.** Hidden route + `ADMIN_USER_IDS` env allowlist checked against
   the Clerk `userId`, enforced both at the route and in the Convex admin mutations. Dedicated
   admin portal deferred. (See §7.)
5. **Run-completed trigger — DECIDED.** Fires when the export is `ready` **and** the user has
   downloaded it (first download of a ready export → `completed`). (See §4.)

Remaining genuinely-open items: the **default** `renderStrategy` per format, and the
**replica cap** value on Railway (right-sized from `export_build_*` volume once live).

```

```
