import type { Config } from '../config.js';
import type { PdfOptions } from '../types.js';
import { upstreamError } from '../errors.js';

/** MIME for the bytes Gotenberg returns on the Chromium PDF route. */
export const PDF_MIME = 'application/pdf';

/**
 * Append PDF page options as Gotenberg form fields. Gotenberg reads booleans
 * and numbers as their string form; only emit fields that were supplied.
 */
function appendPdfOptions(form: FormData, options: PdfOptions | undefined): void {
	if (!options) return;
	const entries: Record<string, string | number | boolean | undefined> = {
		paperWidth: options.paperWidth,
		paperHeight: options.paperHeight,
		marginTop: options.marginTop,
		marginBottom: options.marginBottom,
		marginLeft: options.marginLeft,
		marginRight: options.marginRight,
		landscape: options.landscape,
		printBackground: options.printBackground,
		scale: options.scale,
		preferCssPageSize: options.preferCssPageSize
	};
	for (const [key, value] of Object.entries(entries)) {
		if (value !== undefined) form.set(key, String(value));
	}
}

/**
 * Render HTML to PDF via Gotenberg's Chromium route
 * (`/forms/chromium/convert/html`). The HTML file MUST be named `index.html`.
 * Network/5xx failures are surfaced as retryable upstream errors so the caller
 * can back off and retry.
 */
export async function htmlToPdf(
	config: Config,
	html: string,
	options: PdfOptions | undefined
): Promise<Uint8Array<ArrayBuffer>> {
	const form = new FormData();
	form.set('files', new Blob([html], { type: 'text/html' }), 'index.html');
	appendPdfOptions(form, options);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.gotenbergTimeoutMs);

	let response: Response;
	try {
		response = await fetch(`${config.gotenbergUrl}/forms/chromium/convert/html`, {
			method: 'POST',
			body: form,
			signal: controller.signal
		});
	} catch (err) {
		const aborted = err instanceof Error && err.name === 'AbortError';
		throw upstreamError(
			aborted ? 'Gotenberg request timed out' : 'Could not reach Gotenberg',
			true,
			aborted ? undefined : String(err)
		);
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		// 5xx is transient (Gotenberg busy/restarting); 4xx is our bad request.
		throw upstreamError(
			`Gotenberg returned ${response.status}`,
			response.status >= 500,
			body.slice(0, 500)
		);
	}

	return new Uint8Array(await response.arrayBuffer());
}
