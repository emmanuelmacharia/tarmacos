import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

/** Constant-time comparison that also tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) {
		// still run a comparison to avoid leaking length via early return timing
		timingSafeEqual(aBuf, aBuf);
		return false;
	}
	return timingSafeEqual(aBuf, bBuf);
}

/**
 * Bearer-token guard. The main app sends `Authorization: Bearer <secret>`;
 * we compare it to RENDERER_SHARED_SECRET in constant time. The renderer is
 * internet-reachable, so this is the only thing standing between the public
 * and an expensive render — keep it on every non-health route.
 */
export function bearerAuth(sharedSecret: string): MiddlewareHandler {
	return async (c, next) => {
		const header = c.req.header('authorization') ?? '';
		const [scheme, token] = header.split(' ');
		if (scheme !== 'Bearer' || !token || !safeEqual(token, sharedSecret)) {
			return c.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
		}
		await next();
	};
}
