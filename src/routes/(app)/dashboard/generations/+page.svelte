<script lang="ts">
	import type { WorkflowEvent } from "$lib/server/ai/schemas";

  let loading = $state(false);
  let events = $state<WorkflowEvent[]>([]);

  let profileId = $state('');
  let jobDescription = $state('');
  let baselineCv = $state('');
  let jobInstructions = $state('');

  let writerModelId = $state('openai/gpt-oss-120b');
  let writerInstructions = $state('');

  let reviewerModelId = $state('openai/gpt-oss-120b');
  let reviewerInstructions = $state('');

  let maxIterations = $state(4);

  function pushEvent(event: WorkflowEvent) {
    events = [...events, event];
  }

  async function startRun() {
    loading = true;
    events = [];

    const response = await fetch('/api/ai/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        profileId: profileId || undefined,
        jobDescription,
        baselineCv,
        jobInstructions: jobInstructions || undefined,
        maxIterations,
        writer: {
          modelId: writerModelId,
          instructions: writerInstructions || undefined
        },
        reviewer: {
          modelId: reviewerModelId,
          instructions: reviewerInstructions || undefined
        }
      })
    });

    if (!response.ok || !response.body) {
      loading = false;
      const text = await response.text();
      pushEvent({
        type: 'error',
        message: text || 'Failed to start workflow'
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          pushEvent(JSON.parse(trimmed));
        }
      }

      if (buffer.trim()) {
        pushEvent(JSON.parse(buffer.trim()));
      }
    } catch (error) {
      pushEvent({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Stream parsing failed'
      });
    } finally {
      loading = false;
    }
  }

  function bubbleClass(event: WorkflowEvent) {
    if (event.type === 'error') return 'bubble system error';
    if (event.type === 'run-started') return 'bubble system';
    if (event.type === 'agent-started') {
      return event.role === 'writer' ? 'bubble writer' : 'bubble reviewer';
    }
    if (event.type === 'draft-produced') return 'bubble writer';
    if (event.type === 'review-produced') return 'bubble reviewer';
    if (event.type === 'approved') return 'bubble system success';
    if (event.type === 'max-iterations-reached') return 'bubble system warning';
    return 'bubble system';
  }
</script>

<form class="run-form" onsubmit={(event) => {
  event.preventDefault();
  startRun();
}}>
  <div class="row">
    <label>
      Profile ID
      <input bind:value={profileId} placeholder="optional profile id" />
    </label>
    <label>
      Max iterations
      <input bind:value={maxIterations} type="number" min="1" max="6" />
    </label>
  </div>

  <label>
    Job description
    <textarea bind:value={jobDescription} rows="10" required></textarea>
  </label>

  <label>
    Baseline CV
    <textarea bind:value={baselineCv} rows="10" required></textarea>
  </label>

  <label>
    Job instructions
    <textarea bind:value={jobInstructions} rows="4"></textarea>
  </label>

  <div class="row">
    <label>
      Writer model
      <input bind:value={writerModelId} />
    </label>

    <label>
      Reviewer model
      <input bind:value={reviewerModelId} />
    </label>
  </div>

  <label>
    Writer run instructions
    <textarea bind:value={writerInstructions} rows="3"></textarea>
  </label>

  <label>
    Reviewer run instructions
    <textarea bind:value={reviewerInstructions} rows="3"></textarea>
  </label>

  <button disabled={loading}>
    {#if loading}
      Running...
    {:else}
      Start run
    {/if}
  </button>
</form>

<section class="trace">
  {#each events as event (event.type)}
    <article class={bubbleClass(event)}>
      {#if event.type === 'run-started'}
        <h3>System</h3>
        <p>
          Run started · writer: {event.writerModelId} · reviewer:
          {event.reviewerModelId}
        </p>
      {/if}

      {#if event.type === 'agent-started'}
        <h3>{event.role} · {event.phase} · iteration {event.iteration}</h3>
        <p>Model: {event.modelId}</p>
      {/if}

      {#if event.type === 'draft-produced'}
        <h3>Writer draft · iteration {event.iteration}</h3>
        <pre>{event.draft}</pre>
      {/if}

      {#if event.type === 'review-produced'}
        <h3>Reviewer result · iteration {event.iteration}</h3>
        <p><strong>Verdict:</strong> {typeof event.review === 'string' ? event.review : event.review.verdict}</p>
        <p><strong>Summary:</strong> {typeof event.review === 'string' ? event.review : event.review.summary}</p>

        {#if typeof event.review !== 'string' && event.review.blockingIssues.length}
          <h4>Blocking issues</h4>
          <ul>
            {#each event.review.blockingIssues as issue (issue.title)}
              <li>
                <strong>{issue.severity}:</strong> {issue.title} —
                {issue.explanation}
              </li>
            {/each}
          </ul>
        {/if}

        {#if typeof event.review !== 'string' && event.review.handoffInstructions.length}
          <h4>Handoff instructions</h4>
          <ul>
            {#each event.review.handoffInstructions as item (item)}
              <li>{item}</li>
            {/each}
          </ul>
        {/if}
      {/if}

      {#if event.type === 'approved'}
        <h3>Approved</h3>
        <pre>{event.finalResume}</pre>
      {/if}

      {#if event.type === 'max-iterations-reached'}
        <h3>Needs human review</h3>
        <pre>{event.finalResume}</pre>
      {/if}

      {#if event.type === 'error'}
        <h3>Error</h3>
        <p>{event.message}</p>
      {/if}
    </article>
  {/each}
</section>

<style>
  .run-form {
    display: grid;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  label {
    display: grid;
    gap: 0.5rem;
  }

  textarea,
  input {
    width: 100%;
  }

  .trace {
    display: grid;
    gap: 1rem;
  }

  .bubble {
    padding: 1rem;
    border-radius: 12px;
    border: 1px solid #ddd;
    white-space: pre-wrap;
  }

  .writer {
    background: #f4f8ff;
  }

  .reviewer {
    background: #fff8f1;
  }

  .system {
    background: #f8f8f8;
  }

  .success {
    border-color: #34c759;
  }

  .warning {
    border-color: #ff9500;
  }

  .error {
    border-color: #ff3b30;
  }

  pre {
    white-space: pre-wrap;
    overflow-x: auto;
  }
</style>