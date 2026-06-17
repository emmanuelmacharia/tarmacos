import type { Config } from '../config.js';
import type { RenderRequest } from '../types.js';
import { badRequest, notImplemented } from '../errors.js';
import { htmlToPdf, PDF_MIME } from './gotenberg.js';

export interface RenderResult {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Dispatch a validated render request to the right engine.
 *
 * v1 ships PDF (Chromium via Gotenberg) — see plan §11.2 "PDF first". The two
 * DOCX strategies are scaffolded but not yet implemented:
 *   - 'libreoffice'   -> HTML -> DOCX via Gotenberg's LibreOffice route
 *   - 'docxtemplater' -> data-driven .docx template (higher Word fidelity)
 */
export async function render(config: Config, req: RenderRequest): Promise<RenderResult> {
	if (req.format === 'pdf') {
		if (!req.html) throw badRequest('html is required for pdf rendering');
		const bytes = await htmlToPdf(config, req.html, req.pdfOptions);
		return { bytes, contentType: PDF_MIME };
	}

	// format === 'docx'
	const strategy = req.renderStrategy ?? 'libreoffice';
	void DOCX_MIME; // referenced once DOCX lands
	throw notImplemented(
		`DOCX rendering (strategy: ${strategy}) is not implemented yet; PDF-first per the rollout plan`
	);
}
