import { json, type RequestHandler } from '@sveltejs/kit';
import { WorkflowRequestSchema, type WorkflowEvent } from '../schemas';
import { runWriterReviewerWorkflow } from '../workflow';
import { ZodError } from 'zod';

function toNdJSONLine(event: WorkflowEvent): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(event) + '\n');
}

export const POST: RequestHandler = async ({ request }) => {
	const userId = 'request.body?.userId;'; // fetch user id from server hook (locals)

	if (!userId) {
		return new Response('Unauthorized', { status: 401 });
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = WorkflowRequestSchema.safeParse(body);

	if (!parsed.success) {
		return json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: WorkflowEvent) => {
				controller.enqueue(toNdJSONLine(event));
			};

			try {
				await runWriterReviewerWorkflow({
					userId,
					input: parsed.data,
					signal: request.signal,
					emit: send
				});
			} catch (error) {
				const message =
					error instanceof ZodError
						? error.message
						: error instanceof Error
							? error.message
							: 'Unknown workflow error';
				send({ type: 'error', message });
			} finally {
				controller.close();
			}
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-cache no-transform',
			Connection: 'keep-alive'
		}
	});
};
