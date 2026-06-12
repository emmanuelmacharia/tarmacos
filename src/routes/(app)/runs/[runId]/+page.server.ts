import { DEFAULT_MAX_USER_FEEDBACK_ITERATIONS } from '$lib/server/ai/models';
import type { PageServerLoad } from './$types';

// the feedback cap lives in $lib/server/ai/models.ts; surface it here so the
// composer can render the limit banner without a round trip
export const load: PageServerLoad = async () => {
	return {
		maxUserFeedbackIterations: DEFAULT_MAX_USER_FEEDBACK_ITERATIONS
	};
};
