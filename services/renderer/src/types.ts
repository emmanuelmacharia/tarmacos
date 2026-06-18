import { z } from 'zod';

/**
 * Renderer API contract (v1).
 *
 * This is the single source of truth for the request/response shape. The main
 * app's typed client (`src/lib/server/render/`) mirrors these types. The path
 * is versioned (`/v1/render`) so a breaking change is explicit and the two
 * sides can be migrated independently if the service is ever extracted.
 */

export const exportFormatSchema = z.enum(['pdf', 'docx']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const renderStrategySchema = z.enum(['libreoffice', 'docxtemplater']);
export type RenderStrategy = z.infer<typeof renderStrategySchema>;

/**
 * PDF page options forwarded to Chromium. Margins/paper sizes are CSS-style
 * length strings (e.g. "1cm", "0.5in") as Gotenberg expects.
 */
export const pdfOptionsSchema = z
	.object({
		paperWidth: z.string().optional(),
		paperHeight: z.string().optional(),
		marginTop: z.string().optional(),
		marginBottom: z.string().optional(),
		marginLeft: z.string().optional(),
		marginRight: z.string().optional(),
		landscape: z.boolean().optional(),
		printBackground: z.boolean().optional(),
		scale: z.number().positive().max(2).optional(),
		// honour @page size from the template's print CSS when set
		preferCssPageSize: z.boolean().optional()
	})
	.strict();
export type PdfOptions = z.infer<typeof pdfOptionsSchema>;

/**
 * A render request. `html` is the fully-compiled template+data markup (the same
 * HTML the client previews, which is what guarantees WYSIWYG — see plan Q2).
 * The docxtemplater strategy will later add a template-bytes + data variant.
 */
export const renderRequestSchema = z
	.object({
		format: exportFormatSchema,
		// docx only; ignored for pdf. Defaults to 'libreoffice' for docx.
		renderStrategy: renderStrategySchema.optional(),
		html: z.string().min(1).optional(),
		fileName: z.string().min(1).max(200).optional(),
		pdfOptions: pdfOptionsSchema.optional()
	})
	.strict()
	.superRefine((value, ctx) => {
		// Every currently-supported path is HTML-driven, so html is required.
		if (!value.html) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['html'],
				message: 'html is required for the requested format/strategy'
			});
		}
	});
export type RenderRequest = z.infer<typeof renderRequestSchema>;

/** Raster formats Gotenberg's Chromium screenshot route can emit. */
export const imageFormatSchema = z.enum(['png', 'jpeg', 'webp']);
export type ImageFormat = z.infer<typeof imageFormatSchema>;

/**
 * A screenshot request (template thumbnails, plan §2/§11.5). Renders the same
 * compiled HTML the export pipeline uses, captured as an image. Defaults to a
 * single US-Letter page at ~96dpi (816×1056) so a thumbnail shows page one.
 */
export const screenshotRequestSchema = z
	.object({
		html: z.string().min(1),
		format: imageFormatSchema.optional(),
		width: z.number().int().positive().max(4000).optional(),
		height: z.number().int().positive().max(8000).optional(),
		// clip to width×height (one page) vs capture the full scrollable height
		clip: z.boolean().optional(),
		// jpeg/webp only
		quality: z.number().int().min(0).max(100).optional(),
		fileName: z.string().min(1).max(200).optional()
	})
	.strict();
export type ScreenshotRequest = z.infer<typeof screenshotRequestSchema>;
export type ScreenshotOptions = Omit<ScreenshotRequest, 'html' | 'fileName'>;

export interface RenderErrorBody {
	error: {
		code: string;
		message: string;
		details?: unknown;
	};
}
