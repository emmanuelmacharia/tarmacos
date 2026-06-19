import { parseStartWorkflowApiRequest } from '$lib/server/ai/workflow/api/parse';
import { buildWorkflowArgs, prepareWorkflowStart } from '$lib/server/ai/workflow/api/prepare';
import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { createRun } from '$lib/server/ai/workflow/orchestration/orchestrator';
import { withApiErrorHandling } from '$lib/utils/errorHandler';
import { getPostHogClient } from '$lib/server/posthog';
import { json } from '@sveltejs/kit';

export const POST = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex, id: userId } = apiEvent.ctx;

	const rawInput = await parseStartWorkflowApiRequest(event.request);

	const prepared = await prepareWorkflowStart({ convex, input: rawInput });

	console.log('after preparation ----> ', prepared);

	const workflowRequest = await buildWorkflowArgs(prepared, convex);

	console.log('build workflow Args ====> ', workflowRequest);

	const result = await createRun(workflowRequest.convex, workflowRequest.input);

	if (!result?._id) {
		throw new Error('Failed to create run');
	}

	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: userId,
		event: 'run_created',
		properties: {
			run_id: result._id,
			run_title: result.title,
			has_instructions: !!rawInput.jobInstructions?.trim()
		}
	});
	await posthog.flush();

	return json({ id: result._id, title: result.title }, { status: 201 });
});
