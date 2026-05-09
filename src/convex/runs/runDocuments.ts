import { v } from 'convex/values';
import { action, internalMutation } from '../_generated/server';
import { documentPurpose } from '../lib/schemaTypes';
import { assertFound, withAppErrors } from '../lib/errorMapper';
import type { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';

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

export const saveTextFile = action({
	args: {
		text: v.string(),
		filename: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);
			const clerkId = identity.subject;

			await ctx.runQuery(internal.runs.internals.getUser, { clerkId });

			const blob = new Blob([args.text], {
				type: 'text/plain;charset=utf-8'
			});

			const storageId = await ctx.storage.store(blob);

			return {
				storageId,
				size: blob.size,
				format: blob.type,
				mimeType: blob.type,
				filename: args.filename ?? 'pasted-text.txt',
				contentType: 'text/plain;charset=utf-8'
			};
		});
	}
});
