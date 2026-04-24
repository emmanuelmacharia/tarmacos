import { ConvexHttpClient } from 'convex/browser';
import type { LayoutServerLoad } from './$types';
import { api } from '../../../convex/_generated/api';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { redirect } from '@sveltejs/kit';
import { parseConvexMessage } from '$lib/utils/errorHandler';

export const load: LayoutServerLoad = async (event) => {
	const client = new ConvexHttpClient(PUBLIC_CONVEX_URL);
	const auth = await event.locals.auth();
	const token = await auth.getToken({ template: 'convex' });

	if (token) {
		client.setAuth(token);
	}
	try {
		const profiles = await client.query(api.user.profiles.fetchUserProfiles);
		return { profiles };
	} catch (error) {
		if (error instanceof Error) {
			const errorObj = parseConvexMessage(error.message);
			if (errorObj?.code === 'UNAUTHORIZED' || errorObj?.code === 'FORBIDDEN') {
				throw redirect(303, '/');
			}
			console.error('Failed to load profiles:', error.message);
		}
	}
};
