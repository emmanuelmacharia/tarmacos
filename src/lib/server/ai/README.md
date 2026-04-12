# Resume Tailoring System: Data Architecture

## Status

Simplified architecture definition for a Convex-backed resume-tailoring workflow.

---

## Scope

This document defines the data architecture for a multi-agent workflow that tailors resumes to job descriptions through a chat-based experience.

It covers:

- schema design
- entity responsibilities and relationships
- indexing
- lifecycle and orchestration
- canonical vs raw data separation
- provider/model variability handling
- retrieval patterns
- implementation invariants

It does not cover:

- UI design
- prompt-writing strategy
- generic product behavior beyond what affects persistence or retrieval

---

# 1. System Overview

A `run` is the top-level container for a single resume-tailoring session.

A run represents both a workflow execution and a chat thread.

Each run ties together:

- user inputs and uploaded documents
- workflow state and phase progression
- user-visible messages
- the logical artifact being produced and its full version history
- reviewer decisions
- raw LLM invocations
- downloadable exports

The architecture separates three concerns:

1. **Workflow and chat state**
   - `runs`
   - `messages`

2. **Canonical application content**
   - `artifacts`
   - `artifactVersions`
   - `reviews`

3. **Raw provider/runtime state**
   - `llmCalls`
   - `llmCallContents`

Orchestration is app-driven. The application server makes all LLM calls and drives the workflow loop. Convex serves as the transactional state machine: validating phase transitions, persisting data atomically, enforcing invariants, and returning typed instructions that tell the app what to do next.

---

# 2. Core Architectural Principles

## 2.1 Run-centric partitioning

All workflow, chat, review, versioning, and diagnostics data is grouped under `runId`.

This enables:

- efficient user history retrieval
- coherent per-run debugging
- replay and recovery
- analytics by run
- clear lineage

---

## 2.2 Append-first history with mutable projections

Immutable or append-only:

- `messages`
- `artifactVersions`
- `reviews`
- `llmCallContents`

Created then patched to terminal state:

- `llmCalls`
- `exports`

Projection/current-state rows that are intentionally mutable:

- `runs`
- `artifacts`

The operating rule:

- history is appended
- current pointers are updated
- nothing is deleted during normal operation

---

## 2.3 Canonical app data is distinct from raw provider data

Canonical normalized data is stored separately from raw model/provider output.

Canonical data:

- reviewer output lives in `reviews`
- writer/draft output lives inline on `artifactVersions`

Raw/runtime data:

- invocation metadata lives in `llmCalls`
- prompt/response/reasoning bodies live in `llmCallContents`

This separation is required because OpenRouter provider routing may vary by model, provider, routed path, and invocation strategy. The application must preserve both what the provider returned and what the system accepted as canonical.

---

## 2.4 Provenance is a pointer, not a graph

Every AI-generated canonical output (`reviews`, `artifactVersions`) carries a `sourceLlmCallId` field pointing to the LLM call that produced the accepted result.

When inspecting a canonical output, the system can:

1. follow `sourceLlmCallId` to `llmCalls` for model, provider, strategy, and token metadata
2. load `llmCallContents` for raw prompt/response bodies
3. query other `llmCalls` on the same run with the same `phase` to find retries or fallback attempts

This is sufficient because in this system, a canonical output is produced by one successful call. Retry history is available through the `llmCalls` table filtered by run and phase. A separate provenance graph table is unnecessary.

---

## 2.5 App-driven orchestration with Convex as state machine

The application server owns all LLM calls and external I/O. Convex owns all state.

The contract:

- **Convex mutations** validate phase transitions, persist all data atomically, enforce invariants, and return a typed `NextInstruction` telling the app what to do
- **The application** executes LLM calls, handles retries and normalization, and reports results back to Convex via mutations
- **No Convex actions or scheduler** are involved in the core LLM workflow loop

Convex's scheduler may still be used for background housekeeping such as timeout detection or deferred cleanup, but it is not part of the primary orchestration path.

---

## 2.6 Inline content where payloads are small

Resume JSON is typically 5–15KB. Review payloads are 1–3KB. These are well within Convex's 1MB document limit.

Content is stored inline on the owning row for:

- `artifactVersions` (canonical JSON, markdown, plain text)
- `reviews` (structured review content)
- `messages` (chat body text)

Content is stored in a separate sidecar table only for:

- `llmCallContents` (LLM prompts and raw responses, which can be large)

This eliminates content-sidecar tables that would add joins without meaningful benefit at this system's scale.

---

## 2.7 Message sequence numbers from a parent counter

Chat message ordering uses an explicit sequence number allocated from `runs.nextMessageSeqNo`.

This is the only counter maintained on runs. All other ordering uses Convex's `_creationTime`.

Message ordering requires an explicit counter because:

- chat rendering is order-critical for the user experience
- message inserts may come from different sources (user, agents, system)
- `_creationTime` is sufficient for all non-chat ordering needs

---

## 2.8 Exports are cached materializations

Exports are generated once per immutable artifact version and render recipe, then reused.

Uniqueness is defined by:

- `artifactVersionId`
- `format`
- `exporterVersion`
- `renderOptionsHash`

---

## 2.9 Strict schemas for deterministic layers

The following must use strict, versioned schemas:

- `artifactVersions.canonicalJson`
- `reviews.content`
- `llmCalls.requestParams`

`v.any()` may be used only for non-canonical metadata, not for core workflow contracts.

---

# 3. Existing Tables Assumed

The following existing tables are assumed and reused:

- `users`
- `profiles`
- `documents`

`documents` stores uploaded/generated file metadata and file/blob storage references.

---

# 4. Final Table Set

1. `runs`
2. `runDocuments`
3. `messages`
4. `artifacts`
5. `artifactVersions`
6. `reviews`
7. `llmCalls`
8. `llmCallContents`
9. `exports`

---

# 5. Entity Definitions

## 5.1 `runs`

### Responsibility

Top-level workflow container, chat thread, and agent configuration snapshot.

### Fields

- `userId`
- `profileId?`
- `title`
- `status`
- `phase`
- `currentArtifactId?`
- `currentArtifactVersionId?`
- `finalArtifactVersionId?`
- `parentRunId?`
- `nextMessageSeqNo`
- `loopCount`
- `agentConfig`
- `metadata?`
- `error?`
- `createdAt`
- `updatedAt`
- `completedAt?`

### `agentConfig` structure

```typescript
v.object({
	reviewer: v.object({
		modelSlug: v.string(),
		gatewayProvider: v.string(),
		systemPromptVersion: v.string(),
		defaultRequestParams: v.object({
			/* strict versioned schema */
		})
	}),
	writer: v.object({
		modelSlug: v.string(),
		gatewayProvider: v.string(),
		systemPromptVersion: v.string(),
		defaultRequestParams: v.object({
			/* strict versioned schema */
		})
	})
});
```

### Status values

- `created`
- `running`
- `awaiting_user`
- `completed`
- `failed`
- `cancelled`

### Phase values

- `baseline_review`
- `drafting`
- `reviewing`
- `revision`
- `user_review`
- `finalizing`

### Indexes

- `byUserUpdated` → `["userId", "updatedAt"]`
- `byProfileUpdated` → `["profileId", "updatedAt"]`
- `byParent` → `["parentRunId"]`

### Notes

- `status` is the high-level run state
- `phase` is the current workflow position and the single source of truth for "what happens next"
- `agentConfig` is set at run creation and captures the full agent configuration snapshot
- agent roles are fixed at design time (`reviewer`, `writer`) and do not require separate tables
- `loopCount` tracks how many review→revision cycles have occurred
- `error` captures the last unrecoverable error message for failed runs

---

## 5.2 `runDocuments`

### Responsibility

Join table linking uploaded or generated documents to a run.

### Fields

- `runId`
- `documentId`
- `purpose`
- `extractedText?`
- `createdAt`

### Purpose values

- `baseline_resume`
- `job_description`
- `supporting_document`
- `generated_export`

### Indexes

- `byRun` → `["runId"]`
- `byRunPurpose` → `["runId", "purpose"]`
- `byDocument` → `["documentId"]`

### Notes

- `extractedText` stores the usable text extracted from the uploaded file (parsed PDF, OCR result, etc.)
- this eliminates the need for a separate `documentContents` table
- for the baseline resume, `extractedText` is an intermediate form; the canonical structured representation is the first imported `artifactVersion`
- generated export files are linked back here with the `generated_export` purpose

---

## 5.3 `messages`

### Responsibility

User-visible chat transcript.

### Fields

- `runId`
- `seqNo`
- `authorType`
- `authorRole?`
- `messageType`
- `visibility`
- `bodyFormat`
- `body`
- `relatedArtifactVersionId?`
- `relatedReviewId?`
- `createdAt`

### Author type values

- `user`
- `agent`
- `system`

### Author role values

- `user`
- `writer`
- `reviewer`
- `system`

### Message type values

- `user_prompt`
- `review_summary`
- `draft_announcement`
- `revision_request`
- `approval`
- `system_status`
- `final_message`

### Visibility values

- `user_visible`
- `internal`

### Body format values

- `text`
- `markdown`

### Indexes

- `byRunSeq` → `["runId", "seqNo"]`
- `byRunVisibilitySeq` → `["runId", "visibility", "seqNo"]`

### Notes

- message body is stored inline because chat rendering is the hot read path
- messages must remain presentational and reasonably small
- `body` should contain rendered summaries, not raw canonical data

### Design rule

Messages are presentation-layer projections, not canonical records.

- the canonical review lives in `reviews`
- the canonical draft lives on `artifactVersions`
- the message is a user-facing rendering or summary of those records

---

## 5.4 `artifacts`

### Responsibility

Logical output produced by a run.

### Fields

- `runId`
- `artifactType`
- `status`
- `currentVersionId?`
- `finalVersionId?`
- `nextVersionNo`
- `createdAt`
- `updatedAt`

### Artifact type values

- `resume`
- `cover_letter`

### Artifact status values

- `in_progress`
- `approved`
- `finalized`
- `abandoned`

### Indexes

- `byRun` → `["runId"]`

### Notes

- one artifact represents one logical thing being produced
- drafts and revisions do not create new artifacts; they create new versions
- `nextVersionNo` is the only artifact-level counter; it ensures deterministic version ordering

---

## 5.5 `artifactVersions`

### Responsibility

Immutable version in the artifact lineage, with content inline. This uses the "AppendOnly" principle, where we don't mutate the record, but add another version of it.

### Fields

- `artifactId`
- `runId`
- `versionNo`
- `basedOnVersionId?`
- `origin`
- `status`
- `previewText`
- `canonicalJson?`
- `markdown?`
- `plainText?`
- `contentHash?`
- `sourceLlmCallId?`
- `createdAt`

### Origin values

- `imported_source`
- `agent_draft`
- `agent_revision`
- `user_revision`
- `system_finalized`

### Artifact version status values

- `draft`
- `submitted_for_review`
- `revision_requested`
- `approved`
- `finalized`

### Indexes

- `byArtifactVersion` → `["artifactId", "versionNo"]`
- `byArtifactCreatedAt` → `["artifactId", "createdAt"]`
- `byBasedOnVersion` → `["basedOnVersionId"]`
- `byRun` → `["runId", "createdAt"]`

### Notes

- versions are immutable after insert
- content is inline because resume JSON is small (typically 5–15KB)
- `canonicalJson` is the preferred source of truth and must conform to a strict, versioned resume schema
- `markdown` is a cached presentation form
- `plainText` is a fallback representation
- `previewText` is a short summary for timeline/history display
- `sourceLlmCallId` links to the LLM invocation that produced this version (null for imported or human-authored versions)
- the baseline resume is imported as version 1 so the full lineage is version-based from the start

### Canonical output rule

For resume artifacts, `canonicalJson` must use a strict, versioned resume schema.

The system must not assume the model will always return native structured output. The canonical record may be produced via:

- native structured output
- prompted JSON
- freeform text + normalization

Regardless of path, the persisted canonical representation must be deterministic.

---

## 5.6 `reviews`

### Responsibility

Canonical reviewer output.

### Fields

- `runId`
- `artifactVersionId`
- `reviewKind`
- `decision?`
- `summary`
- `content`
- `schemaVersion`
- `sourceLlmCallId?`
- `createdAt`

### Review kind values

- `baseline_assessment`
- `draft_review`

### Decision values

- `approve`
- `revise`

### Indexes

- `byRunCreatedAt` → `["runId", "createdAt"]`
- `byArtifactVersion` → `["artifactVersionId", "createdAt"]`

### Notes

- `content` is a strict, versioned structured object containing the full review payload: scores, section-level feedback, improvement suggestions, and any metrics
- `summary` is a short human-readable overview suitable for display
- `schemaVersion` identifies the version of the `content` schema for forward compatibility
- `sourceLlmCallId` links to the LLM call whose output was directly normalized into canonical form
  - if native structured output succeeded, it points to that call
  - if prompted JSON succeeded, it points to that call
  - if freeform text was normalized app-side into canonical structure, it still points to that call
  - if we later use another LLM call to repair the output and that repaired result becomes canonical, then it points to the repair call
- reviewer output is structure-critical; canonical review data must always land in this table before a review is considered complete

### Canonical review rule

Even if the provider returns malformed or inconsistent output, the system must normalize the result into a deterministic canonical review structure before persisting.

---

## 5.7 `llmCalls`

### Responsibility

Operational metadata for each provider/model invocation.

### Fields

- `runId`
- `phase`
- `role`
- `attemptNo`
- `retryOfCallId?`
- `gatewayProvider`
- `modelSlug`
- `routedProvider?`
- `openrouterRequestId?`
- `requestParams`
- `requestedStrategy`
- `strategyUsed?`
- `status`
- `latencyMs?`
- `inputTokens?`
- `outputTokens?`
- `reasoningTokens?`
- `cachedTokens?`
- `costUsd?`
- `finishReason?`
- `normalizationStatus?`
- `normalizationError?`
- `createdAt`
- `completedAt?`
- `loopnumber`
- `operationKind`

### LLM call status values

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

### Strategy values

- `native_structured`
- `prompted_json`
- `freeform_text`

### Normalization status values

- `pending`
- `succeeded`
- `failed`

### OperationKind status values

- `baseline_review`
- `draft_generation`
- `draft_review`
- `draft_revision`
- `revision_review`
- `user_feedback_draft`

### Indexes

- `byRunCreatedAt` → `["runId", "createdAt"]`
- `byRunPhase` → `["runId", "phase"]`
- `byOpenrouterRequestId` → `["openrouterRequestId"]`
- `byLoopAndOperation` → `["runId", "loopNumber", "operationKind"]`

### Notes

- `phase` tags which workflow phase triggered this call
- `role` is `reviewer` or `writer`
- `requestedStrategy` captures the intended structured-output approach
- `strategyUsed` captures what actually succeeded
- `requestParams` must be strict and versioned
- `retryOfCallId` links to the previous failed attempt if this is a retry
- raw prompt/response bodies do not live here; they go in `llmCallContents`
- to find all calls for a given phase, query `byRunPhase`
- to reconstruct retry chains, follow `retryOfCallId`

---

## 5.8 `llmCallContents`

### Responsibility

Cold storage for large LLM prompt, response, reasoning, and raw payloads.

### Fields

- `llmCallId`
- `kind`
- `format`
- `text?`
- `json?`
- `storageKey?`
- `contentBytes?`
- `createdAt`

### Kind values

- `prompt`
- `raw_request`
- `response`
- `raw_response`
- `reasoning`
- `structured_output`

### Format values

- `text`
- `json`

### Indexes

- `byCallKind` → `["llmCallId", "kind"]`

### Notes

- this is the one justified hot/cold split; LLM prompts and responses can be tens of KB and are rarely read outside debugging
- `structured_output` stores the model-returned structured JSON when available
- `reasoning` stores visible reasoning text if persisted
- token counts stay on `llmCalls`; only the full text bodies live here

---

## 5.9 `exports`

### Responsibility

Cached downloadable materializations of immutable artifact versions.

### Fields

- `runId`
- `artifactVersionId`
- `format`
- `exporterVersion`
- `renderOptionsHash`
- `status`
- `documentId?`
- `contentHash?`
- `fileSizeBytes?`
- `mimeType?`
- `createdAt`
- `completedAt?`

### Format values

- `pdf`
- `docx`
- `txt`

### Export status values

- `pending`
- `ready`
- `failed`

### Indexes

- `byRunCreatedAt` → `["runId", "createdAt"]`
- `byRenderKey` → `["artifactVersionId", "format", "exporterVersion", "renderOptionsHash"]`

### Notes

- exports are reused when the same render key matches
- `documentId` points to the generated downloadable file in the `documents` table
- generated export files are also linked to the run via `runDocuments` with purpose `generated_export`

---

# 6. Orchestration Model

## 6.1 App-driven orchestration with Convex as state machine

The application server (e.g. Next.js API routes) owns all LLM calls and external I/O. Convex owns all state, validates transitions, and tells the app what to do next.

The contract:

- **Convex mutations** validate the current phase, persist all data atomically, advance the phase, and return a typed `NextInstruction`
- **The application** executes LLM calls, handles retries and normalization, and reports results back to Convex via mutations
- **No Convex actions or scheduler** are involved in the core LLM workflow loop

```text
App                                   Convex
 │                                       │
 ├─ mutation: createRun ────────────────►│ create run, artifact,
 │◄─ return { runId, next } ────────────┤ runDocuments, import baseline v1,
 │                                       │ return next instruction
 │                                       │
 ├─ make LLM call (baseline review) ────│
 │                                       │
 ├─ mutation: completeBaselineReview ───►│ validate phase, insert review +
 │◄─ return { next } ──────────────────┤ message, advance phase,
 │                                       │ return next instruction
 │                                       │
 ├─ make LLM call (draft) ─────────────│
 │                                       │
 ├─ mutation: completeDraft ───────────►│ insert version + message,
 │◄─ return { next } ──────────────────┤ advance phase,
 │                                       │ return next instruction
 │                                       │
 │  ... loop continues ...               │
```

---

## 6.2 The `NextInstruction` type

Every state-advancing mutation returns a typed instruction telling the app what to do:

```typescript
type NextInstruction =
	| {
			action: 'call_reviewer';
			artifactVersionId: Id<'artifactVersions'>;
			reviewKind: 'baseline_assessment' | 'draft_review';
	  }
	| {
			action: 'call_writer';
			reviewId: Id<'reviews'>;
			basedOnVersionId: Id<'artifactVersions'>;
	  }
	| { action: 'await_user' }
	| {
			action: 'generate_export';
			artifactVersionId: Id<'artifactVersions'>;
	  }
	| { action: 'done' };
```

The app does not need to know the state machine rules. It executes the instruction it receives and reports results back.

---

## 6.3 Responsibilities

### The application is responsible for

- Making LLM calls (via OpenRouter or direct provider)
- Retry logic for transient LLM failures
- Normalization and repair of model output into canonical schemas
- Calling the appropriate Convex mutation with canonical results
- Handling user input and calling the corresponding mutation

### Convex is responsible for

- Phase transition validation (rejecting out-of-order or invalid calls)
- Atomic persistence of all records within a transition (version + message + pointer updates in one mutation)
- Sequence number allocation
- Returning the next instruction
- Enforcing invariants (e.g., no version without content, no review without canonical data)

---

## 6.4 Workflow phases and transitions

```text
created
  │
  ▼
baseline_review ──► drafting ──► reviewing ──┐
                       ▲                      │
                       │    (revise)          ▼
                       └──── revision ◄── user_review
                                              │
                                         (approve)
                                              │
                                              ▼
                                         finalizing
                                              │
                                              ▼
                                          completed
```

Any non-terminal phase may transition to `failed` on unrecoverable error or `cancelled` on explicit cancel.

---

## 6.5 Mutation contracts

### `createRun`

**Precondition:** valid user, uploaded documents available.

**Effects:**

- create `runs` row (phase: `baseline_review`, status: `running`)
- create `artifacts` row
- create `runDocuments` rows
- import baseline resume as `artifactVersions` v1 (origin: `imported_source`)
- update `artifacts.currentVersionId` and `runs.currentArtifactVersionId`

**Returns:** `{ runId, next: { action: "call_reviewer", artifactVersionId, reviewKind: "baseline_assessment" } }`

---

### `startLlmCall`

**Precondition:** run exists and is not terminal.

**Effects:**

- insert `llmCalls` row (status: `running`)

**Returns:** `{ llmCallId }`

**Notes:** called by the app before making an LLM call, so the invocation is recorded regardless of outcome.

---

### `completeLlmCall`

**Precondition:** `llmCalls` row exists with status `running`.

**Effects:**

- patch `llmCalls` to `completed` or `failed` with metadata (tokens, cost, latency, finish reason, normalization status)
- insert `llmCallContents` rows (prompt, response, reasoning, structured output as applicable)

**Returns:** `{ llmCallId }`

**Notes:** this records the raw provider result. It does not advance the workflow. The subsequent domain mutation (e.g., `completeBaselineReview`) advances the phase.

---

### `completeBaselineReview`

**Precondition:** phase is `baseline_review`.

**Effects:**

- insert `reviews` row (reviewKind: `baseline_assessment`, sourceLlmCallId)
- append reviewer summary message
- set phase → `drafting`

**Returns:** `{ next: { action: "call_writer", reviewId, basedOnVersionId } }`

---

### `completeDraft`

**Precondition:** phase is `drafting` or `revision`.

**Effects:**

- allocate version number from `artifacts.nextVersionNo`
- insert `artifactVersions` (origin: `agent_draft` or `agent_revision`, sourceLlmCallId, inline content)
- update `artifacts.currentVersionId` and `runs.currentArtifactVersionId`
- append draft announcement message
- set phase → `reviewing`

**Returns:** `{ next: { action: "call_reviewer", artifactVersionId, reviewKind: "draft_review" } }`

---

### `completeReview`

**Precondition:** phase is `reviewing`.

**Effects:**

- insert `reviews` row (reviewKind: `draft_review`, sourceLlmCallId)
- if decision is `revise`:
  - append revision request message
  - increment `runs.loopCount`
  - set phase → `revision`
  - return `{ next: { action: "call_writer", reviewId, basedOnVersionId } }`
- if decision is `approve`:
  - append approval message
  - set phase → `user_review`, status → `awaiting_user`
  - return `{ next: { action: "await_user" } }`

---

### `userApprove`

**Precondition:** phase is `user_review`, status is `awaiting_user`.

**Effects:**

- set artifact version status → `approved`
- set phase → `finalizing`, status → `running`

**Returns:** `{ next: { action: "generate_export", artifactVersionId } }`

---

### `userRequestChanges`

**Precondition:** phase is `user_review`, status is `awaiting_user`.

**Effects:**

- append user feedback message
- set phase → `drafting`, status → `running`

**Returns:** `{ next: { action: "call_writer", reviewId: null, basedOnVersionId } }`

**Notes:** when the user provides direct feedback (rather than the reviewer), `reviewId` may be null and the app constructs the writer prompt from the user's message content instead.

---

### `completeExport`

**Precondition:** phase is `finalizing`.

**Effects:**

- insert `exports` row (status: `ready`)
- create `runDocuments` link (purpose: `generated_export`)
- set `runs.finalArtifactVersionId`
- set `artifacts.status` → `finalized`, `artifacts.finalVersionId`
- set phase remains `finalizing`, status → `completed`
- append final message

**Returns:** `{ next: { action: "done" } }`

---

### `failRun`

**Precondition:** run is not already terminal.

**Effects:**

- set status → `failed`
- set `runs.error` with summary
- append system status message

---

### `cancelRun`

**Precondition:** run is not already terminal.

**Effects:**

- set status → `cancelled`
- append system status message

---

### `retryRun`

**Precondition:** status is `failed`.

**Effects:**

- clear `runs.error`
- set status → `running`

**Returns:** the `NextInstruction` corresponding to the current `phase`, allowing the app to resume the loop from where it failed.

---

## 6.6 App-side orchestration loop

The app-side driver is a straightforward loop:

```typescript
async function executeRun(runId: Id<'runs'>) {
	let instruction = await convex.mutation(api.runs.startRun, {
		runId
	});

	while (instruction.action !== 'done' && instruction.action !== 'await_user') {
		switch (instruction.action) {
			case 'call_reviewer': {
				const { llmCallId } = await convex.mutation(api.llmCalls.start, {
					runId,
					phase: 'reviewing',
					role: 'reviewer'
					/* ... provider config ... */
				});
				try {
					const raw = await callReviewerLLM(instruction);
					await convex.mutation(api.llmCalls.complete, {
						llmCallId,
						status: 'completed',
						raw
					});
					const canonical = normalizeReview(raw);
					if (instruction.reviewKind === 'baseline_assessment') {
						instruction = await convex.mutation(api.runs.completeBaselineReview, {
							runId,
							llmCallId,
							canonical
						});
					} else {
						instruction = await convex.mutation(api.runs.completeReview, {
							runId,
							llmCallId,
							canonical
						});
					}
				} catch (e) {
					await convex.mutation(api.llmCalls.complete, {
						llmCallId,
						status: 'failed',
						error: e.message
					});
					await handleRetryOrFail(runId, e);
					return;
				}
				break;
			}

			case 'call_writer': {
				const { llmCallId } = await convex.mutation(api.llmCalls.start, {
					runId,
					phase: 'drafting',
					role: 'writer'
				});
				try {
					const raw = await callWriterLLM(instruction);
					await convex.mutation(api.llmCalls.complete, {
						llmCallId,
						status: 'completed',
						raw
					});
					const canonical = normalizeResume(raw);
					instruction = await convex.mutation(api.runs.completeDraft, {
						runId,
						llmCallId,
						canonical
					});
				} catch (e) {
					await convex.mutation(api.llmCalls.complete, {
						llmCallId,
						status: 'failed',
						error: e.message
					});
					await handleRetryOrFail(runId, e);
					return;
				}
				break;
			}

			case 'generate_export': {
				try {
					const exportData = await generateExportFile(instruction);
					instruction = await convex.mutation(api.runs.completeExport, { runId, ...exportData });
				} catch (e) {
					await handleRetryOrFail(runId, e);
					return;
				}
				break;
			}
		}
	}
}
```

---

## 6.7 Resuming after user input

The loop exits naturally when the instruction is `await_user`. When the user acts:

1. The UI calls `userApprove` or `userRequestChanges`
2. The mutation returns the next instruction
3. The app re-enters the loop with that instruction

This can be triggered by an API route handler. The app calls the mutation, receives the instruction, and runs the loop from that point.

```typescript
async function handleUserApproval(runId: Id<'runs'>) {
	const instruction = await convex.mutation(api.runs.userApprove, {
		runId
	});
	await executeRunFromInstruction(runId, instruction);
}

async function handleUserChanges(runId: Id<'runs'>, feedback: string) {
	const instruction = await convex.mutation(api.runs.userRequestChanges, { runId, feedback });
	await executeRunFromInstruction(runId, instruction);
}
```

---

## 6.8 Error handling

### Transient failures

The app owns retry logic for LLM calls. It may retry a failed call N times before giving up. Each retry records a new `llmCalls` row with `retryOfCallId` pointing to the previous attempt and an incremented `attemptNo`.

### Persistent failures

If retries are exhausted, the app calls `failRun` to record the error and halt the workflow.

### Manual retry

A user or admin triggers `retryRun`. The mutation clears the error, sets status back to `running`, and returns the `NextInstruction` for the current phase. The app resumes the loop.

---

## 6.9 Background housekeeping

Convex's scheduler may be used for concerns outside the core LLM loop:

- **Timeout detection:** a scheduled function checks for runs stuck in `awaiting_user` beyond a threshold and sends a reminder or auto-cancels
- **Cleanup:** deferred deletion of orphaned data or expired exports
- **Analytics aggregation:** periodic rollups of LLM cost or token usage

These do not participate in the workflow state machine.

---

# 7. Canonical Output and Provider Variation Model

## 7.1 Problem statement

Because the system uses OpenRouter and provider routing may vary, the application cannot assume:

- native structured output support is always available
- the requested provider will be the actual routed provider
- output format consistency across models/providers
- identical response behavior across retries or fallback paths

---

## 7.2 Two-layer model

Every AI-produced result exists in two layers:

### Raw execution layer

- `llmCalls` — invocation metadata, model, provider, strategy, tokens, cost
- `llmCallContents` — prompt, raw response, reasoning, structured output

### Canonical application layer

- `reviews` — deterministic structured review data
- `artifactVersions` — deterministic structured resume data

The application relies on the canonical layer. The raw layer exists for debugging, analytics, and auditability.

---

## 7.3 Normalization responsibility

Because the app makes LLM calls, normalization happens app-side before calling Convex mutations.

The flow:

1. App calls the LLM and receives a raw response
2. App records the raw response via `completeLlmCall`
3. App normalizes/repairs the raw response into the canonical schema
4. App calls the domain mutation (e.g., `completeDraft`) with the canonical data
5. Convex persists the canonical record atomically

The `llmCalls` row records whether normalization was needed (`normalizationStatus`) and any errors encountered (`normalizationError`). This metadata is set by the app when completing the LLM call.

---

## 7.4 Provenance via pointer

Each canonical output carries a `sourceLlmCallId` pointing to the LLM call that produced the accepted result.

To inspect a review or draft with full provider context:

1. load the canonical record
2. follow `sourceLlmCallId` to `llmCalls`
3. read model, provider, strategy, normalization status, tokens, cost
4. optionally load `llmCallContents` for raw bodies

To find retry or fallback history for the same operation:

1. query `llmCalls.byRunPhase(runId, phase)`
2. order by `_creationTime`
3. the full chain of attempts is visible

---

# 8. Retrieval Patterns

## 8.1 Run list

Query `runs.byUserUpdated(userId)`.

Return lightweight fields: title, status, phase, updatedAt.

---

## 8.2 Chat screen

Query `messages.byRunSeq(runId)` or `messages.byRunVisibilitySeq(runId, "user_visible")`.

Render directly from message rows; bodies are inline.

---

## 8.3 Current draft

1. Read `runs.currentArtifactVersionId`
2. Load `artifactVersions` by ID
3. Render from `canonicalJson` → `markdown` → `plainText` (preference order)

---

## 8.4 Version history

1. Read the run's current artifact
2. Query `artifactVersions.byArtifactVersion(artifactId)`
3. Display `versionNo`, `origin`, `status`, `previewText`, `createdAt`
4. Load full content only when the user opens a specific version

---

## 8.5 Current review state

Query `reviews.byArtifactVersion(currentArtifactVersionId)` and take the latest row.

---

## 8.6 Diagnostics

For a specific review or artifact version:

1. Follow `sourceLlmCallId` to `llmCalls`
2. Load `llmCallContents.byCallKind(llmCallId)` for raw bodies
3. Query `llmCalls.byRunPhase(runId, phase)` for retry history

---

## 8.7 Export retrieval

1. Compute render key: `(artifactVersionId, format, exporterVersion, renderOptionsHash)`
2. Query `exports.byRenderKey`
3. If `ready`, return the stored file
4. Otherwise generate, store, and return

---

# 9. Implementation Rules

## 9.1 All writes go through domain mutations

No table should be written from arbitrary application code.

Core mutations:

- `createRun`
- `attachDocument`
- `startLlmCall`
- `completeLlmCall`
- `completeBaselineReview`
- `completeDraft`
- `completeReview`
- `userApprove`
- `userRequestChanges`
- `requestExport`
- `completeExport`
- `failRun`
- `cancelRun`
- `retryRun`

---

## 9.2 Message creation rule

1. Allocate `seqNo` from `runs.nextMessageSeqNo` and increment the counter
2. Insert `messages` row
3. Patch `runs.updatedAt`

Messages are created inside domain mutations (e.g., `completeBaselineReview` appends a reviewer summary message). The app does not insert messages directly except for user-authored messages.

Messages must remain reasonably small. Large structured content belongs in `reviews` or `artifactVersions`, not in message bodies.

---

## 9.3 Artifact version creation rule

Every artifact version insert must:

1. Allocate `versionNo` from `artifacts.nextVersionNo` and increment
2. Insert `artifactVersions` with content fields populated
3. Update `artifacts.currentVersionId`
4. Update `runs.currentArtifactVersionId`

All of this happens in a single mutation. No version row should exist without its content (content is inline, so this is guaranteed by insert).

---

## 9.4 Baseline import rule

The uploaded baseline resume must be imported as version 1 of the run's resume artifact.

The lineage:

- version 1 = imported baseline (`origin: imported_source`)
- version 2 = first tailored draft (`origin: agent_draft`)
- version 3+ = revisions

---

## 9.5 Review completion rule

A review is complete only when canonical review data has been written to `reviews`.

Not when raw provider text exists, not when a message has been appended. Canonical persistence is the completion condition.

---

## 9.6 LLM call recording rule

Each provider invocation must be recorded in two layers:

1. `llmCalls` — created before the call (status: `running`), completed after
2. `llmCallContents` — prompt, response, reasoning, structured output

This applies even when structured output fails or normalization is required. The app calls `startLlmCall` before making the request and `completeLlmCall` after, regardless of outcome.

---

## 9.7 Phase transition validation rule

Every domain mutation that advances the workflow must validate that `runs.phase` matches the expected precondition. If the phase is wrong, the mutation must reject the call.

This is the primary safety mechanism against out-of-order or duplicate calls. Because Convex mutations are serialized per-document, this check is race-free.

---

## 9.8 Export rule

Exports are cached and reused. If an export already exists for the same render key and is `ready`, the system returns the stored file.

---

# 10. Schema Strictness Guidance

## 10.1 `requestParams`

Must be strict and versioned. Should include:

- temperature, topP, maxOutputTokens
- reasoning configuration
- response format
- routing preferences
- stop sequences, seed

Provider-specific raw request bodies may additionally be stored in `llmCallContents`.

---

## 10.2 `reviews.content`

Must be strict and versioned. This is a structured object containing:

- section-level scores and feedback
- overall assessment metrics
- improvement suggestions
- any other reviewer-produced structured data

The schema version is tracked via `reviews.schemaVersion`.

---

## 10.3 `artifactVersions.canonicalJson`

Must be strict and versioned. For resume artifacts, this is the canonical structured document model that drives rendering, export, diffing, and analytics.

---

# 11. Workflow Defaults and Operational Configuration

## 11.1 Problem

The workflow depends on configuration values that fall into two categories:

1. **Structural defaults** — temperatures, token limits, prompt versions, request param schemas. These change during development, benefit from type-checking and version control, and belong in code.

2. **Operational knobs** — iteration caps, model slugs. These may need emergency changes in production (model outage, prompt loop discovered) without a code deploy.

A dedicated database table is unnecessary at this stage. There is no admin UI, no per-tenant override requirement, and no need for reactive config subscriptions. The configuration surface is small and stable.

---

## 11.2 Approach: Code Defaults with Env Var Overrides

All defaults are defined as typed constants in code. A narrow set of operational-critical values can be overridden via environment variables at runtime without redeployment.

```typescript
// convex/config/workflowDefaults.ts

const WORKFLOW_DEFAULTS = {
	maxIterations: 5,
	maxRetriesPerCall: 3,

	reviewer: {
		modelSlug: 'anthropic/claude-sonnet-4',
		gatewayProvider: 'openrouter',
		systemPromptVersion: 'reviewer-v1',
		defaultRequestParams: {
			temperature: 0.3,
			maxOutputTokens: 4096
			// ... strict versioned fields
		}
	},

	writer: {
		modelSlug: 'anthropic/claude-sonnet-4',
		gatewayProvider: 'openrouter',
		systemPromptVersion: 'writer-v1',
		defaultRequestParams: {
			temperature: 0.7,
			maxOutputTokens: 8192
			// ... strict versioned fields
		}
	}
} as const;

export type WorkflowDefaults = typeof WORKFLOW_DEFAULTS;

/**
 * Resolve workflow config: code defaults + env var overrides.
 * Only operational-critical values are overridable via env.
 */
export function resolveWorkflowConfig(): WorkflowDefaults {
	return {
		...WORKFLOW_DEFAULTS,
		maxIterations: intEnv('MAX_ITERATIONS', WORKFLOW_DEFAULTS.maxIterations),
		maxRetriesPerCall: intEnv('MAX_RETRIES_PER_CALL', WORKFLOW_DEFAULTS.maxRetriesPerCall),
		reviewer: {
			...WORKFLOW_DEFAULTS.reviewer,
			modelSlug: stringEnv('REVIEWER_MODEL_SLUG', WORKFLOW_DEFAULTS.reviewer.modelSlug)
		},
		writer: {
			...WORKFLOW_DEFAULTS.writer,
			modelSlug: stringEnv('WRITER_MODEL_SLUG', WORKFLOW_DEFAULTS.writer.modelSlug)
		}
	};
}

function intEnv(key: string, fallback: number): number {
	const val = process.env[key];
	if (val === undefined) return fallback;
	const parsed = parseInt(val, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function stringEnv(key: string, fallback: string): string {
	return process.env[key]?.trim() || fallback;
}
```

---

## 11.3 Env Var Surface

Only operational-critical values are exposed as env var overrides. Everything else — temperatures, token limits, prompt versions, request param schemas — remains in code where it is type-checked and version-controlled.

| Env Var                | Purpose                           | Default                     |
| ---------------------- | --------------------------------- | --------------------------- |
| `MAX_ITERATIONS`       | Cap review→revision cycles        | `5`                         |
| `MAX_RETRIES_PER_CALL` | LLM retry attempts before failing | `3`                         |
| `REVIEWER_MODEL_SLUG`  | Emergency model swap for reviewer | `anthropic/claude-sonnet-4` |
| `WRITER_MODEL_SLUG`    | Emergency model swap for writer   | `anthropic/claude-sonnet-4` |

---

## 11.4 Usage in Run Creation

The resolved config is read once at run creation and snapshotted onto the run's `agentConfig`. This ensures that every run records exactly which configuration it was created with, even if env vars change between runs.

```typescript
// Inside the createRun mutation
const config = resolveWorkflowConfig();

const runId = await ctx.db.insert('runs', {
	// ...
	loopCount: 0,
	agentConfig: {
		reviewer: config.reviewer,
		writer: config.writer
	}
	// ...
});
```

---

## 11.5 Iteration Guard

`maxIterations` is enforced inside `completeReview` when the reviewer decision is `revise`. This is the single guard against infinite review→revision loops.

```typescript
// Inside completeReview mutation, when decision is "revise"
const config = resolveWorkflowConfig();

if (run.loopCount >= config.maxIterations) {
	// Force-approve: cap reached, present best draft to user
	// append system message explaining the cap
	// set phase → user_review, status → awaiting_user
	// return { next: { action: "await_user" } }
}

// Otherwise: increment loopCount and continue to revision phase
```

The `loopCount` field on `runs` tracks completed review→revision cycles. When it reaches `maxIterations`, the system stops looping and surfaces the current best draft for user review rather than failing the run.

---

## 11.6 Retry Guard

`maxRetriesPerCall` is enforced app-side in the orchestration loop. When an LLM call fails, the app checks `attemptNo` against `maxRetriesPerCall` before deciding whether to retry or call `failRun`.

```typescript
// App-side retry logic
const config = resolveWorkflowConfig();

async function handleRetryOrFail(
	runId: Id<'runs'>,
	llmCallId: Id<'llmCalls'>,
	attemptNo: number,
	error: Error
) {
	if (attemptNo < config.maxRetriesPerCall) {
		// Retry: create a new llmCalls row with incremented
		// attemptNo and retryOfCallId pointing to the failed call
		return;
	}
	// Exhausted: fail the run
	await convex.mutation(api.runs.failRun, {
		runId,
		error: `LLM call failed after ${attemptNo} attempts: ${error.message}`
	});
}
```

---

## 11.7 When to Graduate to a Table

Move configuration to a `systemConfig` table if any of the following become true:

- An admin UI is built for non-developer operators to adjust settings
- Per-tenant or per-plan configuration overrides are required
- An audit trail of configuration changes is needed
- Reactive config is desired (Convex subscription pushes new config without restart)

The migration path is straightforward: move the defaults into a seed script, replace `resolveWorkflowConfig()` with a `ctx.db.query("systemConfig")` call inside mutations, and the snapshotting behavior on `runs.agentConfig` remains unchanged.

---

# 12. Summary

This architecture defines a run-centric, append-first system using 9 tables:

| Table              | Role                                                  |
| ------------------ | ----------------------------------------------------- |
| `runs`             | Workflow state, phase, agent config, current pointers |
| `runDocuments`     | Document-to-run links with extracted text             |
| `messages`         | User-visible chat transcript (inline bodies)          |
| `artifacts`        | Logical output identity and version pointers          |
| `artifactVersions` | Immutable version lineage with inline content         |
| `reviews`          | Canonical reviewer judgments                          |
| `llmCalls`         | LLM invocation metadata                               |
| `llmCallContents`  | Cold storage for prompts/responses                    |
| `exports`          | Cached downloadable materializations                  |

Orchestration is app-driven: the application server makes all LLM calls and drives the workflow loop. Convex serves as the transactional state machine, validating transitions, persisting data atomically, and returning typed instructions. No custom event sourcing, no lease management, no consumer infrastructure.

The design preserves the core architectural properties that matter:

- clean separation of canonical application truth from raw provider evidence
- full version lineage from imported baseline through final approved draft
- provider/model traceability via `sourceLlmCallId`
- append-only history for reviews, versions, messages, and LLM calls
- deterministic ordering for chat messages
- export caching by render key
- strict schemas for all canonical and contract-critical data
- phase-validated state transitions with clear mutation contracts

It omits infrastructure that can be added later if evidence demands it:

- event-sourcing and audit log (add `runEvents` if replay/audit becomes a real requirement)
- multi-call provenance graphs (add `outputProvenance` if repair chains become common)
- hot/cold content splits for non-LLM tables (move content to sidecars if documents grow beyond inline limits)
- per-step tracking (add `runSteps` if multi-call pipeline steps emerge as a distinct concept)
- Convex-side orchestration (move to actions + scheduler if the app-driven loop becomes a bottleneck)
