/**
 * Typed contract for the standalone renderer service (services/renderer).
 *
 * This mirrors the service's `src/types.ts`. The two live in the same repo so a
 * single change keeps them in lockstep; the API path is versioned (`/v1/render`)
 * so a breaking change is explicit if the service is ever extracted to its own
 * repo. Keep this file in sync with the service contract.
 */

export const RENDERER_API_VERSION = 'v1';

export type ExportFormat = 'pdf' | 'docx';
export type RenderStrategy = 'libreoffice' | 'docxtemplater';

/** PDF page options. Margins/paper sizes are CSS length strings (e.g. "1cm"). */
export interface PdfOptions {
	paperWidth?: string;
	paperHeight?: string;
	marginTop?: string;
	marginBottom?: string;
	marginLeft?: string;
	marginRight?: string;
	landscape?: boolean;
	printBackground?: boolean;
	scale?: number;
	preferCssPageSize?: boolean;
}

export interface RenderRequest {
	format: ExportFormat;
	/** docx only; defaults to 'libreoffice' on the service. */
	renderStrategy?: RenderStrategy;
	/** Fully-compiled template + data markup (the same HTML the client previews). */
	html?: string;
	fileName?: string;
	pdfOptions?: PdfOptions;
}

/** Raster formats the screenshot route can emit. */
export type ImageFormat = 'png' | 'jpeg' | 'webp';

/**
 * A template-thumbnail screenshot request (mirrors the service's
 * `screenshotRequestSchema`). Renders the same compiled HTML as an export but
 * captures it as an image; defaults to a clipped single US-Letter page.
 */
export interface ScreenshotRequest {
	html: string;
	format?: ImageFormat;
	width?: number;
	height?: number;
	/** clip to width×height (one page) vs the full scrollable height */
	clip?: boolean;
	/** jpeg/webp only */
	quality?: number;
	fileName?: string;
}

export interface RenderResult {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
	fileName?: string;
}

export interface RenderErrorPayload {
	code: string;
	message: string;
	details?: unknown;
}
