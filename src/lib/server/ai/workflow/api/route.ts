import type { RequestEvent } from '@sveltejs/kit';
import { requireConvexUser, type AuthenticatedConvexUser } from './auth';

export type AuthedRequestEvent = RequestEvent & {
	ctx: AuthenticatedConvexUser;
};

export async function requireAuthedEvent(event: RequestEvent): Promise<AuthedRequestEvent> {
	const ctx = await requireConvexUser(event);
	return Object.assign(event, { ctx });
}
