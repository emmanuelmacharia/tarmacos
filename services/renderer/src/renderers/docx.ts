import HTMLtoDOCXImport from '@turbodocx/html-to-docx';

/** MIME for the bytes the DOCX path returns. */
export const DOCX_MIME =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// The package ships a real ESM default export but CJS-style `export =` typings.
// Node/tsc bind the default directly; some loaders (tsx/esbuild) wrap it under
// `.default`. Normalise so the callable works under every runtime.
type HtmlToDocxFn = typeof HTMLtoDOCXImport;
const HTMLtoDOCX: HtmlToDocxFn =
	typeof HTMLtoDOCXImport === 'function'
		? HTMLtoDOCXImport
		: (HTMLtoDOCXImport as { default: HtmlToDocxFn }).default;

// Letter geometry in twips (1in = 1440tw), mirroring the HTML templates'
// `@page { size: Letter; margin: 0.6in 0.7in }` so PDF and DOCX share a layout.
const LETTER = { width: 12240, height: 15840 };
const MARGINS = { top: 864, bottom: 864, left: 1008, right: 1008 };

/**
 * Convert fully-compiled template HTML into DOCX bytes.
 *
 * This backs the default DOCX strategy (the request's `renderStrategy:
 * 'libreoffice'`). Despite that label the engine is the in-process
 * `@turbodocx/html-to-docx` converter, **not** LibreOffice: Gotenberg only
 * *outputs* PDF, so HTML→DOCX cannot go through it (the plan §2/§12 assumed
 * otherwise). It runs the *same* HTML the client previews and the PDF path
 * renders, so one template still serves both formats. Fidelity is basic
 * (headings, bold/italic, lists, links, tables); the higher-fidelity Word path
 * is the future `docxtemplater` strategy over a real `.docx` template.
 */
export async function htmlToDocx(html: string): Promise<Uint8Array<ArrayBuffer>> {
	const result = await HTMLtoDOCX(html, null, {
		orientation: 'portrait',
		pageSize: LETTER,
		margins: MARGINS,
		font: 'Calibri',
		title: 'Resume'
	});

	if (result instanceof ArrayBuffer) return new Uint8Array(result);
	if (result instanceof Uint8Array) return new Uint8Array(result);
	// Blob (browser builds only) — never hit on the Node server, but typed for completeness.
	return new Uint8Array(await result.arrayBuffer());
}
