import { parseStartWorkflowApiRequest } from '$lib/server/ai/workflow/api/parse';
import { buildWorkflowArgs, prepareWorkflowStart } from '$lib/server/ai/workflow/api/prepare';
import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { startWorkflow } from '$lib/server/ai/workflow/orchestration/orchestrator';
import { withApiErrorHandling } from '$lib/utils/errorHandler';
import { json } from '@sveltejs/kit';

export const POST = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex } = apiEvent.ctx;

	console.log('convex auth ====>', convex);

	const rawInput = await parseStartWorkflowApiRequest(event.request);

	const prepared = await prepareWorkflowStart({ convex, input: rawInput });

	console.log('after preparation ----> ', prepared);

	const workflowRequest = await buildWorkflowArgs(prepared, convex);

	console.log('build workflow Args ====> ', workflowRequest);

	const result = await startWorkflow(workflowRequest.convex, workflowRequest.input);

	return json({ runId: result?.runId, action: result?.terminalAction }, { status: 202 });
});
