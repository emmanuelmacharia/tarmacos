import type { Config } from '../config.js';
import type { RenderRequest } from '../types.js';
import { badRequest, notImplemented } from '../errors.js';
import { htmlToPdf, PDF_MIME } from './gotenberg.js';
import { htmlToDocx, DOCX_MIME } from './docx.js';

export interface RenderResult {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}

/**
 * Dispatch a validated render request to the right engine.
 *
 * - PDF  -> headless Chromium via Gotenberg (plan §11.2 "PDF first").
 * - DOCX -> two strategies (plan §12.1):
 *     - 'libreoffice' (default): the same compiled HTML -> DOCX via the
 *       in-process `@turbodocx/html-to-docx` converter. (The 'libreoffice'
 *       label is historical: Gotenberg only outputs PDF, so HTML→DOCX can't run
 *       through it — see docx.ts.)
 *     - 'docxtemplater': data-driven .docx template (higher Word fidelity);
 *       not implemented until `.docx` template assets exist.
 */
export async function render(config: Config, req: RenderRequest): Promise<RenderResult> {
	if (req.format === 'pdf') {
		if (!req.html) throw badRequest('html is required for pdf rendering');
		const bytes = await htmlToPdf(config, req.html, req.pdfOptions);
		return { bytes, contentType: PDF_MIME };
	}

	// format === 'docx'
	const strategy = req.renderStrategy ?? 'libreoffice';
	if (strategy === 'docxtemplater') {
		throw notImplemented(
			'DOCX docxtemplater strategy is not implemented yet (needs a .docx template); use the default libreoffice strategy'
		);
	}
	if (!req.html) throw badRequest('html is required for docx rendering');
	const bytes = await htmlToDocx(req.html);
	return { bytes, contentType: DOCX_MIME };
}
