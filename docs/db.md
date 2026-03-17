Below is a complete pre-implementation schema package:

1. Required vs optional matrix
2. Enum/value definitions
3. Creation-time vs lifecycle-updated fields
4. Query/index plan
5. Table creation lifecycle across user flows
6. Recommended validations/constraints

# 1) Required vs Optional Matrix

## `users`

Required

- `_id`
- `clerkUserId`
- `email`
- `createdAt`
- `updatedAt`

Optional

- `fullName`
- `imageUrl`
- `status`
- `lastSeenAt`

---

## `userPreferences`

Required

- `_id`
- `userId`
- `createdAt`
- `updatedAt`

Optional

- `defaultProfileId`
- `defaultWriterModel`
- `defaultScorerModel`
- `defaultTemplateId`
- `defaultResumeLength`
- `theme`

---

## `billing`

Required

- `_id`
- `userId`
- `plan`
- `status`
- `createdAt`
- `updatedAt`

Optional

- `monthlyRunLimit`
- `monthlyTokenBudget`
- `currentMonthRuns`
- `currentMonthTokens`

---

## `profiles`

Required

- `_id`
- `userId`
- `name`
- `createdAt`
- `updatedAt`

Optional

- `slug`
- `headline`
- `summary`
- `primaryFocus`
- `yearsOfExperience`
- `seniorityLevel`
- `coreSkills`
- `industries`
- `profilePrompt`
- `promptVersion`
- `preferredTemplateId`
- `isDefault`
- `isArchived`

---

## `documents`

Required

- `_id`
- `userId`
- `profileId`
- `type`
- `sourceFormat`
- `title`
- `version`
- `createdAt`
- `updatedAt`

Optional

- `fileName`
- `mimeType`
- `fileSize`
- `storageKey`
- `contentText`
- `contentJson`
- `isActive`
- `originType`
- `sourceRunId`
- `sourceIterationId`
- `sourceSnapshotId`

---

## `resumeSnapshots`

Required

- `_id`
- `userId`
- `profileId`
- `canonicalJson`
- `factsInventory`
- `createdAt`

Optional

- `documentId`
- `sourceRunId`
- `sourceIterationId`
- `parserVersion`
- `normalizationVersion`

---

## `jobTargets`

Required

- `_id`
- `userId`
- `profileId`
- `name`
- `createdAt`
- `updatedAt`

Optional

- `targetTitle`
- `normalizedTitle`
- `seniority`
- `keywords`
- `mustHaveSkills`
- `niceToHaveSkills`
- `industries`
- `locations`
- `employmentTypes`
- `remotePreference`
- `notes`
- `isActive`

---

## `runs`

Required at creation

- `_id`
- `userId`
- `profileId`
- `baselineSnapshotId`
- `jobDescriptionText`
- `writerModel`
- `scorerModel`
- `status`
- `scoreThreshold`
- `createdAt`
- `updatedAt`

Optional at creation

- `jobTargetId`
- `baselineDocumentId`
- `parentRunId`
- `sourceIterationId`
- `forkReason`
- `jobUrl`
- `companyName`
- `jobTitle`
- `runInstruction`
- `systemPromptVersion`
- `effectivePromptSnapshot`
- `rubricConfigSnapshot`
- `currentIteration`
- `bestIterationId`
- `bestScore`
- `noChangeCount`
- `stopReason`
- `startedAt`
- `completedAt`

---

## `runIterations`

Required

- `_id`
- `runId`
- `iterationNumber`
- `inputSnapshotId`
- `outputSnapshotId`
- `overallScore`
- `pass`
- `createdAt`

Optional

- `writerModel`
- `scorerModel`
- `scoreBreakdown`
- `mustHitResults`
- `diffSummary`
- `recommendations`
- `estimatedPromptTokens`
- `estimatedCompletionTokens`
- `estimatedCost`
- `durationMs`
- `writerRawOutput`
- `scorerRawOutput`

---

## `artifacts`

Required

- `_id`
- `userId`
- `profileId`
- `runId`
- `iterationId`
- `snapshotId`
- `templateId`
- `createdAt`

Optional

- `docxStorageKey`
- `pdfStorageKey`

---

# 2) Enum / Controlled Value Definitions

## Common status enums

### `users.status`

- `active`
- `disabled`

### `profiles.seniorityLevel`

- `intern`
- `junior`
- `mid`
- `senior`
- `staff`
- `principal`
- `lead`
- `manager`

### `documents.type`

- `uploaded_resume`
- `markdown_resume`
- `promoted_generated_resume`

### `documents.sourceFormat`

- `pdf`
- `docx`
- `markdown`
- `txt`
- `json`

### `documents.originType`

- `upload`
- `markdown`
- `promotion`

### `jobTargets.seniority`

- `intern`
- `junior`
- `mid`
- `senior`
- `staff`
- `principal`
- `lead`
- `manager`

### `jobTargets.remotePreference`

- `remote`
- `hybrid`
- `onsite`
- `any`

### `runs.status`

- `draft`
- `queued`
- `running`
- `needs_review`
- `exporting`
- `completed`
- `failed`

### `runs.stopReason`

- `passed`
- `no_score_change`
- `max_iterations`
- `budget_limit`
- `manual_stop`
- `failed`

### `userPreferences.defaultResumeLength`

- `one_page`
- `two_page`
- `auto`

### `billing.plan`

- `free`
- `internal`
- `pro`
- `admin`

### `billing.status`

- `active`
- `paused`
- `canceled`
- `trial`

---

# 3) Field Lifecycle: Creation-Time vs Updated Later

## `users`

Set at creation:

- `clerkUserId`
- `email`
- `fullName`
- `imageUrl`
- `status`
- `createdAt`
- `updatedAt`

Updated later:

- `email`
- `fullName`
- `imageUrl`
- `status`
- `lastSeenAt`
- `updatedAt`

---

## `userPreferences`

Set at creation:

- `userId`
- `createdAt`
- `updatedAt`

Updated later:

- all preference fields

---

## `billing`

Set at creation:

- `userId`
- `plan`
- `status`
- `createdAt`
- `updatedAt`

Updated later:

- usage counters
- plan/status
- updatedAt

---

## `profiles`

Set at creation:

- `userId`
- `name`
- `profilePrompt` optional
- `createdAt`
- `updatedAt`

Updated later:

- all other profile metadata
- `promptVersion`
- `isDefault`
- `isArchived`

---

## `documents`

Set at creation:

- `userId`
- `profileId`
- `type`
- `sourceFormat`
- `title`
- `version`
- `originType`
- `createdAt`
- `updatedAt`

Updated later:

- metadata fields only if needed
- `isActive`
- `updatedAt`

Should not be overwritten:

- core content fields should result in a new row/version

---

## `resumeSnapshots`

Set at creation only:

- all fields

Never updated after creation.

---

## `jobTargets`

Set at creation:

- `userId`
- `profileId`
- `name`
- `createdAt`
- `updatedAt`

Updated later:

- targeting metadata
- `isActive`
- `updatedAt`

---

## `runs`

Set at creation:

- `userId`
- `profileId`
- `baselineSnapshotId`
- `jobDescriptionText`
- `writerModel`
- `scorerModel`
- `status`
- `scoreThreshold`
- `runInstruction`
- `jobUrl`
- `companyName`
- `jobTitle`
- `jobTargetId`
- `baselineDocumentId`
- `parentRunId`
- `sourceIterationId`
- `forkReason`
- `systemPromptVersion`
- `effectivePromptSnapshot`
- `rubricConfigSnapshot`
- `createdAt`
- `updatedAt`

Updated during workflow:

- `status`
- `currentIteration`
- `bestIterationId`
- `bestScore`
- `noChangeCount`
- `stopReason`
- `startedAt`
- `completedAt`
- `updatedAt`

---

## `runIterations`

Set at creation only:

- all fields

Never updated after creation.

---

## `artifacts`

Set at creation only:

- all fields

Never updated after creation.

---

# 4) Query / Index Plan

These are the key access patterns you’re likely to need.

## `users`

Indexes

- by `clerkUserId`
- by `email`

Queries

- get current user from Clerk id
- admin lookup by email

---

## `userPreferences`

Indexes

- by `userId`

Queries

- load current user preferences

---

## `billing`

Indexes

- by `userId`

Queries

- fetch usage/entitlement state for current user

---

## `profiles`

Indexes

- by `userId`
- by `userId + isDefault`
- by `userId + isArchived`

Queries

- list all active profiles for user
- fetch default profile
- fetch one profile by id

---

## `documents`

Indexes

- by `userId`
- by `profileId`
- by `profileId + type`
- by `profileId + isActive`
- by `sourceRunId`
- by `sourceSnapshotId`

Queries

- list baseline docs by profile
- list all docs for a profile
- fetch document history/version lineage
- fetch promoted docs originating from a run

---

## `resumeSnapshots`

Indexes

- by `profileId`
- by `documentId`
- by `sourceRunId`
- by `sourceIterationId`

Queries

- fetch latest snapshot for a document
- fetch all snapshots for a run
- fetch snapshot lineage for a profile

---

## `jobTargets`

Indexes

- by `userId`
- by `profileId`
- by `profileId + isActive`

Queries

- list active job targets for profile

---

## `runs`

Indexes

- by `userId`
- by `profileId`
- by `status`
- by `parentRunId`
- by `sourceIterationId`
- by `profileId + createdAt` if supported by your query model

Queries

- dashboard runs list
- recent runs for profile
- runs in progress
- rerun/fork lineage
- get active/unfinished run

---

## `runIterations`

Indexes

- by `runId`
- by `runId + iterationNumber`

Queries

- list all iterations for a run
- fetch latest iteration
- fetch best iteration by joining through `runs.bestIterationId`

---

## `artifacts`

Indexes

- by `runId`
- by `iterationId`
- by `snapshotId`
- by `profileId`

Queries

- list exports for a run
- fetch latest artifact
- list exports by profile

---

# 5) Table Creation Lifecycle by User Flow

## Flow A: New user signs up

Creates:

1. `users`
2. `userPreferences`
3. optional `billing`

No profile yet unless you auto-create one.

---

## Flow B: User creates a profile

Creates:

1. `profiles`

May also set:

- `userPreferences.defaultProfileId`

---

## Flow C: User uploads a baseline resume

Creates:

1. `documents`
2. `resumeSnapshots` after parsing/normalization

Notes:

- document is durable user source
- snapshot is immutable canonical representation

---

## Flow D: User creates a markdown resume in-app

Creates:

1. `documents` with `type=markdown_resume`
2. `resumeSnapshots` after normalization

If edited later:

- create a new `documents` version row
- create a new `resumeSnapshots` row

---

## Flow E: User starts a run

Requires:

- existing `profile`
- existing `baselineSnapshot`

Creates:

1. `runs`

Then scheduler executes iterations.

---

## Flow F: System executes iteration N

Creates:

1. `resumeSnapshots` for the generated output
2. `runIterations`

Updates:

- `runs.currentIteration`
- `runs.bestIterationId`
- `runs.bestScore`
- `runs.noChangeCount`
- `runs.status`
- `runs.updatedAt`

---

## Flow G: Run finishes and user exports

Creates:

1. `artifacts`

Updates:

- `runs.status` may go `exporting -> completed`

---

## Flow H: User promotes generated output to new baseline

Creates:

1. `documents` with `type=promoted_generated_resume`
2. optionally a new `resumeSnapshots` row if you want explicit normalization continuity

This doc should reference:

- `sourceRunId`
- `sourceIterationId`
- `sourceSnapshotId`

---

## Flow I: User gives feedback after review and wants regeneration

Creates:

1. new `runs` row

References:

- `parentRunId`
- `sourceIterationId`

No mutation of old run beyond its already-final state.

---

# 6) Recommended Validations / Constraints

## Global constraints

- every user-owned table should validate `userId`
- every record referenced across tables should belong to the same user
- timestamps should be generated server-side

---

## `profiles`

Validation

- `name` required and non-empty
- only one default profile per user
- if `isDefault=true`, unset previous default

---

## `documents`

Validation

- max upload size 5MB
- `sourceFormat` must match uploaded MIME/type expectations
- if `storageKey` is absent, one of `contentText` or `contentJson` should exist
- new versions should create a new row, not update old row content

---

## `resumeSnapshots`

Validation

- immutable after creation
- must contain valid canonical JSON shape
- if `documentId` is present, document must belong to same user/profile
- if `sourceRunId` or `sourceIterationId` is present, they must align consistently

---

## `jobTargets`

Validation

- belongs to same `profileId` and `userId`
- arrays should default to empty arrays, not null where possible

---

## `runs`

Validation

- `baselineSnapshotId` must belong to same user/profile
- `baselineDocumentId`, if provided, must map consistently to baseline snapshot lineage
- `parentRunId` and `sourceIterationId` should be used only for reruns/forks
- `jobDescriptionText` required and non-empty
- `writerModel` and `scorerModel` required
- `status` must move through valid transitions

Suggested status transitions

- `draft -> queued`
- `queued -> running`
- `running -> needs_review`
- `running -> failed`
- `needs_review -> exporting`
- `exporting -> completed`
- `exporting -> failed`

---

## `runIterations`

Validation

- immutable after creation
- `iterationNumber` unique within a run
- `inputSnapshotId` and `outputSnapshotId` must belong to same run context/user
- score range must be 0–100
- `pass=true` should imply scorer output supports that result

---

## `artifacts`

Validation

- immutable after creation
- referenced `runId`, `iterationId`, and `snapshotId` must align
- `templateId` required
- at least one of `docxStorageKey` or `pdfStorageKey` should exist at creation, ideally both by completion

---

# 7) Strongly Recommended MVP Defaults

## For `runs.scoreThreshold`

Default:

- `90`

## For max iterations

Store in code, not schema config for now:

- maybe 8

## For “no score change”

Store in code:

- stop after 3 unchanged iterations

## For template IDs

Hardcode initial set:

- `classic`
- `compact`
- `senior`

---

# 8) Suggested “Do Not Model Yet”

To avoid premature complexity, defer:

- separate `jobDescriptions` table
- separate `promptVersions` table
- separate `modelConfigs` table
- separate `usageEvents` table
- recruiter response tracking
- email workflows
- scraping/job board ingestion entities

---

# 9) Recommended order to implement schema

1. `users`
2. `userPreferences`
3. `profiles`
4. `documents`
5. `resumeSnapshots`
6. `runs`
7. `runIterations`
8. `artifacts`
9. `jobTargets`
10. `billing`

That order mirrors product value and dependencies.

---

# 10) Final Practical Guidance

If you want this schema to age well, treat these as your backbone:

- `profiles` = reusable candidate lenses
- `documents` = durable user-owned sources
- `resumeSnapshots` = canonical immutable truth
- `runs` = workflow executions
- `runIterations` = append-only optimization history
- `artifacts` = user-facing exports
