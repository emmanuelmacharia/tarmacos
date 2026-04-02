import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { OPEN_ROUTER_API_KEY } from '$env/static/private';

export const openRouter = createOpenRouter({
	apiKey: OPEN_ROUTER_API_KEY,
	headers: {
		'HTTP-Referer': 'https://tarmacos.vercel.app',
		'X-Title': 'Resume tailor'
	}
});

export function getChatModel(modelId: string) {
	return openRouter.chat(modelId);
}
