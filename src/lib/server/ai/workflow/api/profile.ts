import type { ConvexHttpClient } from 'convex/browser';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { api } from '../../../../../convex/_generated/api';
import { apiError, handleErrorsFromConvexTransactions } from '$lib/utils/errorHandler';
import { buildProfilerTaskMesage, buildSystemPrompt } from '../../prompt-builder';
import { PROFILE_INFERENCE_MODEL } from '../../models';
import { ProfileCreationSchema } from '../../schemas';
import { profileCreationInference } from '../orchestration/llm';

// creates profile if none is provided
export type ResolveProfileInput = {
	convex: ConvexHttpClient;
	profileId?: Id<'profiles'>;
	resumeText: string;
	jobDescription: string;
};

export type ResolveProfileResult = {
	profileId: Id<'profiles'>;
	source: 'provided' | 'generated';
};

export async function resolveProfileForWorkflow(
	input: ResolveProfileInput
): Promise<ResolveProfileResult> {
	if (input.profileId) {
		await assertProfileExistsAndBelongsToUser(input.convex, input.profileId);
		return {
			profileId: input.profileId,
			source: 'provided'
		};
	}
	const profileArgs = await generateProfileCreationPayload({
		resumeText: input.resumeText,
		jobDescription: input.jobDescription
	}).catch((error) => {
		console.error(error);
		throw apiError(
			'PROFILE_GENERATION_FAILED',
			'could not generate profile from the resume and job description',
			502
		);
	});

	const profileId = await createProfile({
		convex: input.convex,
		profileName: profileArgs.profileName,
		profileSummary: profileArgs.profileSummary,
		primaryFocus: profileArgs.primaryFocus,
		yearsOfExperience: profileArgs.yearsOfExperience,
		seniorityLevel: profileArgs.seniorityLevel
	});

	return {
		profileId: profileId.data.created,
		source: 'generated' as const
	};
}

async function assertProfileExistsAndBelongsToUser(
	convex: ConvexHttpClient,
	profileId: Id<'profiles'>
) {
	try {
		const profile = await convex.query(api.user.profiles.fetchProfile, { profileId });
		if (!profile.ok || !profile.data) {
			throw apiError('PROFILE_NOT_FOUND', 'Profile not found or access denied', 403);
		}
	} catch (error) {
		handleErrorsFromConvexTransactions(error);
	}
}

async function generateProfileCreationPayload(input: {
	resumeText: string;
	jobDescription: string;
}) {
	// build system and creation prompt
	const systemPrompt = buildSystemPrompt({ role: 'profiler', workflow: 'preflight' });
	const prompt = buildProfilerTaskMesage({
		resume: input.resumeText,
		jobDescription: input.jobDescription
	});

	const payload = {
		strategy: 'native_structured' as const,
		systemPrompt,
		profileCreationPrompt: prompt,
		modelSlug: PROFILE_INFERENCE_MODEL.slug,
		schema: ProfileCreationSchema
	};

	// call the model
	const result = await profileCreationInference(payload);
	console.log(result);

	return result;
}

async function createProfile(args: {
	convex: ConvexHttpClient;
	profileName: string;
	profileSummary: string;
	primaryFocus: string;
	yearsOfExperience: number;
	seniorityLevel: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'manager';
}) {
	const profileId = await args.convex.mutation(api.user.profiles.createProfile, {
		name: args.profileName,
		summary: args.profileSummary,
		yearsOfExperience: args.yearsOfExperience,
		seniorityLevel: args.seniorityLevel,
		primaryFocus: args.primaryFocus
	});

	return profileId;
}
