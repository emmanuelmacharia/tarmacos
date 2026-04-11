import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { documentPurpose } from '../lib/schemaTypes';
import { withAppErrors } from '../lib/errorMapper';

export const persistRunDocument = internalMutation({
	// to be called after creating a run
	args: {
		runId: v.id('runs'),
		documents: v.array(
			v.object({
				documentId: v.id('documents'),
				purpose: documentPurpose,
				extractedText: v.optional(v.string())
			})
		)
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			// internal = no user validation again as validation is done when creating the run;
			//  and the only surface this is exposed to should be the createRun/updateRun mutation;

			args.documents.map(async (document) => {
				const payload = {
					runId: args.runId,
					documentId: document.documentId,
					purpose: document.purpose,
					extractedText: document.extractedText,
					createdAt: new Date().getTime()
				};
				await ctx.db.insert('runDocuments', payload);
			});
		});
	}
});
