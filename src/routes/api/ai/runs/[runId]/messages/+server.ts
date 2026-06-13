import { json } from '@sveltejs/kit';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import { DEFAULT_MAX_USER_FEEDBACK_ITERATIONS } from '$lib/server/ai/models';
import { sanitizeUserText } from '$lib/server/ai/prompt-builder';
import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { buildUserFeedbackLimitMessage } from '$lib/server/ai/workflow/orchestration/messages';
import { resumeWorkflow } from '$lib/server/ai/workflow/orchestration/orchestrator';
import {
	apiError,
	parseConvexMessage,
	validationError,
	withApiErrorHandling
} from '$lib/utils/errorHandler';

export const POST = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex } = apiEvent.ctx;
	const runId = event.params.runId as Id<'runs'> | undefined;

	if (!runId) throw validationError('Run id is required');

	const payload = await event.request.json().catch(() => null);
	const message = sanitizeUserText(
		typeof payload?.message === 'string' ? payload.message : '',
		5_000
	);

	if (!message) throw validationError('Message is required');

	// '@reviewer' asks the reviewer for feedback on the latest draft;
	// everything else (including '@writer') goes to the writer for a new draft
	const target = /(^|\s)@reviewer\b/i.test(message) ? ('reviewer' as const) : ('writer' as const);

	let result;
	try {
		result = await convex.mutation(api.runs.index.submitUserFeedback, {
			runId,
			body: message,
			target,
			maxUserFeedbackIterations: DEFAULT_MAX_USER_FEEDBACK_ITERATIONS,
			limitMessage: buildUserFeedbackLimitMessage(DEFAULT_MAX_USER_FEEDBACK_ITERATIONS)
		});
	} catch (error) {
		const parsed = error instanceof Error ? parseConvexMessage(error.message) : null;
		throw apiError(
			parsed?.code ?? 'BAD_REQUEST',
			parsed?.message ?? 'Unable to submit feedback',
			parsed?.status ?? 400
		);
	}

	if (result.limitReached) {
		return json({ limitReached: true, terminalAction: 'await_user' }, { status: 200 });
	}

	const workflow = await resumeWorkflow(convex, { runId, instruction: result.next });

	return json({ limitReached: false, ...workflow }, { status: 200 });
});
