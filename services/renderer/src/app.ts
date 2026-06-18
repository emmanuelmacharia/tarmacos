import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Config } from './config.js';
import { bearerAuth } from './auth.js';
import { render } from './renderers/index.js';
import { htmlToScreenshot } from './renderers/gotenberg.js';
import { RenderError } from './errors.js';
import { renderRequestSchema, screenshotRequestSchema, type RenderErrorBody } from './types.js';

const FILE_EXTENSION: Record<string, string> = {
	'application/pdf': 'pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

function errorBody(code: string, message: string, details?: unknown): RenderErrorBody {
	return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

export function createApp(config: Config): Hono {
	const app = new Hono();

	app.use('*', logger());

	// Liveness probe (unauthenticated) for Railway/Docker health checks.
	app.get('/health', (c) => c.json({ status: 'ok' }));

	// Everything below requires the shared secret.
	app.use('/v1/*', bearerAuth(config.sharedSecret));

	app.post('/v1/render', async (c) => {
		let json: unknown;
		try {
			json = await c.req.json();
		} catch {
			return c.json(errorBody('BAD_REQUEST', 'Request body must be valid JSON'), 400);
		}

		const parsed = renderRequestSchema.safeParse(json);
		if (!parsed.success) {
			return c.json(errorBody('BAD_REQUEST', 'Invalid render request', parsed.error.issues), 400);
		}

		const result = await render(config, parsed.data);
		const ext = FILE_EXTENSION[result.contentType] ?? 'bin';
		const fileName = parsed.data.fileName ?? `document.${ext}`;

		return new Response(result.bytes, {
			status: 200,
			headers: {
				'content-type': result.contentType,
				'content-length': String(result.bytes.byteLength),
				'content-disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`
			}
		});
	});

	// Pre-render a template thumbnail (plan §2/§11.5). Same compiled HTML as the
	// export, captured as an image instead of a document.
	app.post('/v1/screenshot', async (c) => {
		let json: unknown;
		try {
			json = await c.req.json();
		} catch {
			return c.json(errorBody('BAD_REQUEST', 'Request body must be valid JSON'), 400);
		}

		const parsed = screenshotRequestSchema.safeParse(json);
		if (!parsed.success) {
			return c.json(
				errorBody('BAD_REQUEST', 'Invalid screenshot request', parsed.error.issues),
				400
			);
		}

		const { html, fileName, ...options } = parsed.data;
		const result = await htmlToScreenshot(config, html, options);
		const ext = FILE_EXTENSION[result.contentType] ?? 'png';
		const name = fileName ?? `thumbnail.${ext}`;

		return new Response(result.bytes, {
			status: 200,
			headers: {
				'content-type': result.contentType,
				'content-length': String(result.bytes.byteLength),
				'content-disposition': `attachment; filename="${name.replace(/"/g, '')}"`
			}
		});
	});

	app.onError((err, c) => {
		if (err instanceof RenderError) {
			return c.json(
				errorBody(err.code, err.message, err.details),
				err.status as 400 | 401 | 500 | 501 | 502
			);
		}
		console.error('Unhandled renderer error:', err);
		return c.json(errorBody('INTERNAL', 'Internal renderer error'), 500);
	});

	return app;
}
