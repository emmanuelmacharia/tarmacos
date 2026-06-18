import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { withApiErrorHandling, apiError } from '$lib/utils/errorHandler';
import { getPostHogClient } from '$lib/server/posthog';
import { api } from '../../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../../convex/_generated/dataModel';

/**
 * Download endpoint (plan §4/§10, Phase 3). Records the download — the first
 * download of a ready export flips the run to `completed` (requirement #5) — and
 * redirects to the signed storage URL so the browser fetches the file directly.
 */
export const GET = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex, id: userId } = apiEvent.ctx;
	const { runId, exportId } = event.params;

	if (typeof exportId !== 'string') throw apiError('BAD_REQUEST', 'Invalid export id', 400);

	const result = await convex.mutation(api.exports.build.markExportDownloaded, {
		exportId: exportId as Id<'exports'>
	});
	const { url, firstDownload } = result.data;

	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: userId,
		event: firstDownload ? 'export_downloaded' : 'export_redownloaded',
		properties: { run_id: runId, export_id: exportId }
	});
	await posthog.flush();

	// return the redirect as a Response (not `throw redirect`), so the
	// withApiErrorHandling wrapper doesn't catch it as an error.
	return new Response(null, { status: 302, headers: { location: url } });
});
