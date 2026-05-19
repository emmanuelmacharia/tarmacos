import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { resumeWorkflow } from '$lib/server/ai/workflow/orchestration/orchestrator';
import { json } from '@sveltejs/kit';
import { api } from '../../../../../../convex/_generated/api';
import { withApiErrorHandling } from '$lib/utils/errorHandler';
import type { Id } from '../../../../../../convex/_generated/dataModel';

export const POST = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex } = apiEvent.ctx;
	const { runId } = event.params;
	const isRunId = (id: string | undefined): id is Id<'runs'> => typeof id === 'string';

	if (!isRunId(runId)) return json({ message: 'Bad request' }, { status: 400 });
	const runExists = await convex.query(api.runs.index.getRun, { runId, getInstructions: true });

	const { run, next } = runExists.data;

	const result = await resumeWorkflow(convex, {
		runId: run._id,
		instruction: next
	});

	return json(result, { status: 200 });
});
