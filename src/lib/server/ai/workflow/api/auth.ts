import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { unauthenticated } from '$lib/utils/errorHandler';
import { ConvexHttpClient } from 'convex/browser';

export type AuthenticatedConvexUser = {
	id: string;
	convex: ConvexHttpClient;
};

type ClerkAuthResult = {
	userId?: string | null;
	getToken: (options?: { template?: string }) => Promise<string | null>;
};

type LocalsWithClerk = App.Locals & {
	auth: () => Promise<ClerkAuthResult>;
};

export async function requireConvexUser(event: {
	locals: App.Locals;
}): Promise<AuthenticatedConvexUser> {
	const locals = event.locals as LocalsWithClerk;

	if (!locals.auth) {
		throw unauthenticated();
	}

	const auth = await locals.auth();

	if (!auth.userId) {
		throw unauthenticated();
	}

	const token = await auth.getToken({ template: 'convex' });

	if (!token) {
		throw unauthenticated();
	}

	const convex = new ConvexHttpClient(PUBLIC_CONVEX_URL);
	convex.setAuth(token);

	return { id: auth.userId, convex };
}
