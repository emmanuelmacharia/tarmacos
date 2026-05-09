import { ConvexHttpClient } from 'convex/browser';
import { env } from '$env/dynamic/private';

if (!env.CONVEX_DEPLOYMENT) {
	throw new Error('Convec URL is required');
}

export const convex = new ConvexHttpClient(env.CONVEX_DEPLOYMENT);
