import type { Role } from '$lib/data/models';
import type { ConvexHttpClient } from 'convex/browser';
import { sanitizeUserText } from './prompt-builder';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { handleErrorsFromConvexTransactions } from '$lib/utils/errorHandler';

async function loadUserJobProfileInstructions(
	convex: ConvexHttpClient,
	args: { profileId: string }
) {
	/**
	 * It fetches the custom instructions the user creates when creating a profile
	 * Profiles are sandboxes that users can bundle up job runs that allow easy navigation and management
	 * One of the optional parameters of profiles is the creation of custom ai instructions that would be stored in the db, and fetched when the user initiates a run in that profile
	 * It makes sense that instructions can be role based = both for writers and reviewers
	 * 
	 *return {
   		writerInstructions: 'Prefer concise achievement bullets.',
   		reviewerInstructions: 'Be strict about ATS alignment and factual consistency.'
 		}
	 */

	void args;
	try {
		const { data } = await convex.query(api.user.profiles.fetchProfile, {
			profileId: args.profileId as Id<'profiles'>
		});

		return data as Doc<'profiles'>;
	} catch (error) {
		throw handleErrorsFromConvexTransactions(error);
	}
	return null;
}

/**
 * There are five levels of instructions that can be fed into the prompt:
 * 1. Base instructions: these are the core instructions that are always fed into the prompt, they include the definition of the role, and the workflow, and are not customizable by the user
 * 2. Workflow instructions: these are the instructions that are specific to each workflow, and are not customizable by the user. They are meant to guide the ai on how to perform the task, and can be updated by us as we learn more about how the ai performs on different workflows
 * 3. Profile instructions: these are the custom instructions that the user can create for each profile (custom instruction tied to profile)
 * 4. The Job description and baseline cv - these are part of the main prompt when creating a job run. These are mandatory from the user.
 * 5. Job instructions: these are the instructions that are specific to each job run, and are fed in the job creation form (custom instruction tied to run)
 *
 * The function below is responsible for merging all these custom instructions. The merging process is done in a way that ensures we cannot override the uncustomizable instructions (base and workflow), but allows the user to have full control over the customizable instructions (profile and job) while ensuring that the mandatory instructions (job description and baseline cv) are always included in the final prompt.
 */

export async function resolveCustomProfileInstructions(
	convex: ConvexHttpClient,
	args: {
		role: Role;
		profileId: string;
	}
): Promise<string | undefined> {
	if (!args.profileId) return undefined;

	const profile = await loadUserJobProfileInstructions(convex, {
		profileId: args.profileId
	});

	if (!profile) return undefined;

	const raw = args.role === 'writer' ? profile.profileWriterPrompt : profile.profileReaderPrompt;

	const safe = sanitizeUserText(raw ?? '', 4000);

	return safe || undefined;
}
