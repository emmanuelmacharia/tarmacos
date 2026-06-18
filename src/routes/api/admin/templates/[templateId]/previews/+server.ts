import { json } from '@sveltejs/kit';
import { requireAuthedEvent } from '$lib/server/ai/workflow/api/route';
import { withApiErrorHandling, apiError } from '$lib/utils/errorHandler';
import { renderDocument, renderScreenshot, RendererClientError } from '$lib/server/render/client';
import { compileResumeHtml } from '$lib/render/compile';
import { SAMPLE_RESUME_CANONICAL_JSON } from '$lib/render/sample';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';

/**
 * Admin-only preview generation (plan §11.5). Renders a template's thumbnail
 * (PNG screenshot) and sample file (PDF) from neutral sample data through the
 * *same* compile + renderer path a real export uses, stores both, and patches
 * the template's `thumbnailStorageId` / `sampleStorageId`. The admin gate is
 * enforced in Convex (`getTemplateForPreview` / `setTemplatePreviews` call
 * `assertAdmin`), so this route never relies on its own check.
 */
export const POST = withApiErrorHandling(async (event) => {
	const apiEvent = await requireAuthedEvent(event);
	const { convex } = apiEvent.ctx;
	const { templateId } = event.params;

	if (typeof templateId !== 'string') throw apiError('BAD_REQUEST', 'Invalid template id', 400);
	const id = templateId as Id<'templates'>;

	// Admin-gated server-side; a non-admin caller fails inside Convex.
	const template = (
		await convex.query(api.templates.admin.getTemplateForPreview, { templateId: id })
	).data;

	// Only resume sample data exists today; cover-letter previews need their own sample.
	if (template.templateType !== 'resume') {
		throw apiError(
			'UNSUPPORTED_TEMPLATE_TYPE',
			`Preview generation has no sample data for ${template.templateType} templates yet`,
			400
		);
	}
	if (!template.assetUrl) {
		throw apiError('TEMPLATE_ASSET_MISSING', 'Template asset is unavailable', 500);
	}

	// Compile the shared neutral sample through the export's own compile path so
	// the thumbnail/sample are faithful to what the template actually produces.
	const assetRes = await fetch(template.assetUrl).catch(() => null);
	if (!assetRes || !assetRes.ok) {
		throw apiError('TEMPLATE_FETCH_FAILED', 'Could not load template asset', 502);
	}
	let html: string;
	try {
		html = compileResumeHtml(await assetRes.text(), SAMPLE_RESUME_CANONICAL_JSON);
	} catch (err) {
		throw apiError(
			'TEMPLATE_COMPILE_FAILED',
			err instanceof Error ? err.message : 'Compile failed',
			500
		);
	}

	const store = async (
		bytes: Uint8Array<ArrayBuffer>,
		contentType: string
	): Promise<Id<'_storage'>> => {
		const uploadUrl = await convex.mutation(api.templates.admin.generateTemplateUploadUrl, {});
		const uploadRes = await fetch(uploadUrl, {
			method: 'POST',
			headers: { 'Content-Type': contentType },
			body: bytes
		});
		if (!uploadRes.ok)
			throw apiError('STORAGE_UPLOAD_FAILED', 'Could not store preview asset', 502);
		const { storageId } = (await uploadRes.json()) as { storageId: Id<'_storage'> };
		return storageId;
	};

	try {
		const [thumb, sample] = await Promise.all([
			renderScreenshot({ html, format: 'png', fileName: `${template.key}-thumbnail.png` }),
			renderDocument({ format: 'pdf', html, fileName: `${template.key}-sample.pdf` })
		]);

		const [thumbnailStorageId, sampleStorageId] = await Promise.all([
			store(thumb.bytes, thumb.contentType),
			store(sample.bytes, sample.contentType)
		]);

		await convex.mutation(api.templates.admin.setTemplatePreviews, {
			templateId: id,
			thumbnailStorageId,
			sampleStorageId
		});

		return json(
			{ status: 'ok', templateId: id, thumbnailStorageId, sampleStorageId },
			{ status: 200 }
		);
	} catch (err) {
		if (err instanceof RendererClientError) {
			throw apiError(
				err.code,
				err.message,
				err.status && err.status < 500 ? 400 : 502,
				err.details
			);
		}
		throw err;
	}
});
