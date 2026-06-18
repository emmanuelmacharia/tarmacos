import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { withApiErrorHandling, apiError } from '$lib/utils/errorHandler';
import { getPostHogClient } from '$lib/server/posthog';
import { renderDocument, RendererClientError } from '$lib/server/render/client';
import { compileResumeHtml } from '$lib/render/compile';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';

const bodySchema = z.object({
	templateId: z.string().min(1),
	format: z.enum(['pdf', 'docx']),
	renderStrategy: z.enum(['libreoffice', 'docxtemplater']).optional()
});

/**
 * Build endpoint (plan §6, Phase 3). Drives a single document export: open the
 * `exports` job (→ `finalizing`), compile the template over the run's canonical
 * data, render via the renderer service, store the bytes, and mark the export
 * ready — or failed (a render failure is not a run failure). Dedupe + run-state
 * rules live in the Convex mutations; this route owns the compile/render/store.
 */
export const POST = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex, id: userId } = apiEvent.ctx;
	const { runId } = event.params;

	if (typeof runId !== 'string') throw apiError('BAD_REQUEST', 'Invalid run id', 400);

	const parsed = bodySchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		throw apiError('VALIDATION_FAILED', 'Invalid export request', 400, parsed.error.issues);
	}
	const { format, renderStrategy } = parsed.data;
	const templateId = parsed.data.templateId as Id<'templates'>;

	const posthog = getPostHogClient();
	const baseProps = { run_id: runId, template_id: templateId, format };

	const started = await convex.mutation(api.exports.build.startExportBuild, {
		runId: runId as Id<'runs'>,
		templateId,
		format,
		renderStrategy
	});
	const data = started.data;

	posthog.capture({ distinctId: userId, event: 'export_requested', properties: baseProps });

	// a ready export already exists for this exact render key — return it, no work
	if (data.status === 'ready') {
		await posthog.flush();
		return json({ status: 'ready', export: data.export, deduped: true }, { status: 200 });
	}
	// another build for the same key is already in flight
	if (!('canonicalJson' in data)) {
		await posthog.flush();
		return json({ status: 'building', exportId: data.exportId }, { status: 202 });
	}

	const { exportId, canonicalJson, templateAssetUrl, fileName } = data;

	const fail = async (code: string, message: string, status = 502, details?: unknown) => {
		await convex.mutation(api.exports.build.failExportBuild, {
			exportId,
			error: { code, message, details }
		});
		posthog.capture({
			distinctId: userId,
			event: 'export_build_failed',
			properties: { ...baseProps, error_code: code }
		});
		await posthog.flush();
		return json({ status: 'failed', error: { code, message } }, { status });
	};

	if (!templateAssetUrl) {
		return fail('TEMPLATE_ASSET_MISSING', 'Template asset is unavailable', 500);
	}

	let html: string;
	try {
		const assetRes = await fetch(templateAssetUrl);
		if (!assetRes.ok) return fail('TEMPLATE_FETCH_FAILED', 'Could not load template asset', 502);
		html = compileResumeHtml(await assetRes.text(), canonicalJson);
	} catch (err) {
		return fail(
			'TEMPLATE_COMPILE_FAILED',
			err instanceof Error ? err.message : 'Compile failed',
			500
		);
	}

	posthog.capture({ distinctId: userId, event: 'export_build_started', properties: baseProps });
	const startedAt = Date.now();

	try {
		const result = await renderDocument({
			format,
			html,
			fileName,
			renderStrategy
		});

		const contentHash = createHash('sha256').update(result.bytes).digest('hex');

		// hand the bytes to Convex storage via its upload-url flow
		const uploadUrl = await convex.mutation(api.documents.upload.generateUploadUrl, {});
		const uploadRes = await fetch(uploadUrl, {
			method: 'POST',
			headers: { 'Content-Type': result.contentType },
			body: result.bytes
		});
		if (!uploadRes.ok) return fail('STORAGE_UPLOAD_FAILED', 'Could not store rendered file', 502);
		const { storageId } = (await uploadRes.json()) as { storageId: Id<'_storage'> };

		const completed = await convex.mutation(api.exports.build.completeExportBuild, {
			exportId,
			storageId,
			fileName: result.fileName ?? fileName,
			fileSizeBytes: result.bytes.byteLength,
			mimeType: result.contentType,
			contentHash
		});

		posthog.capture({
			distinctId: userId,
			event: 'export_build_succeeded',
			properties: { ...baseProps, build_latency_ms: Date.now() - startedAt }
		});
		await posthog.flush();

		return json({ status: 'ready', export: completed.data }, { status: 200 });
	} catch (err) {
		if (err instanceof RendererClientError) {
			return fail(err.code, err.message, err.status && err.status < 500 ? 400 : 502, err.details);
		}
		return fail('RENDER_FAILED', err instanceof Error ? err.message : 'Render failed', 500);
	}
});
