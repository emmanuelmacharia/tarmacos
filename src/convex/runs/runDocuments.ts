import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { documentPurpose } from '../lib/schemaTypes';
import { withAppErrors } from '../lib/errorMapper';
import type { Id } from '../_generated/dataModel';

export type DocumentSnapShot = {
	documentId: Id<'documents'>;
	purpose: 'baseline_resume' | 'job_description' | 'supporting_documents' | 'generated_export';
	extractedText: string;
	snapshot: {
		extractedText?: string;
		extractedTextSource?: {
			kind: 'storage';
			storageId: Id<'_storage'>;
			mimeType: 'text/plain';
			byteLength: number;
		};
	};
};

export const persistRunDocument = internalMutation({
	// to be called after creating a run
	args: {
		runId: v.id('runs'),
		documents: v.array(
			v.object({
				documentId: v.id('documents'),
				purpose: documentPurpose,
				extractedText: v.optional(v.string()),
				extractedTextSource: v.optional(
					v.object({
						kind: v.literal('storage'),
						storageId: v.id('_storage'),
						mimeType: v.literal('text/plain'),
						byteLength: v.number()
					})
				)
			})
		)
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			// internal = no user validation again as validation is done when creating the run;
			//  and the only surface this is exposed to should be the createRun/updateRun mutation;
			await Promise.all(
				args.documents.map(async (document) => {
					const payload = {
						runId: args.runId,
						documentId: document.documentId,
						purpose: document.purpose,
						extractedText: document.extractedText,
						extractedTextSource: document.extractedTextSource,
						createdAt: new Date().getTime()
					};
					await ctx.db.insert('runDocuments', payload);
				})
			);
		});
	}
});
