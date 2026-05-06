// we need to process the JD; convert it into a file that we can save in run documents

import type { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';

type AllowedFileTypes = 'pdf' | 'docx' | 'markdown' | 'txt' | 'json';

export async function createFileFromJD(
	convex: ConvexHttpClient,
	args: { text: string; filename: string; profileId?: Id<'profiles'> }
) {
	const file = await convex.action(api.runs.runDocuments.saveTextFile, { ...args });

	const persistedDoc = await persistJDtoDB(convex, {
		profileId: args.profileId,
		fileName: file.filename,
		fileSize: file.size,
		storageId: file.storageId,
		format: 'txt' as AllowedFileTypes,
		mimeType: file.mimeType
	});
	return { ...file, documentId: persistedDoc.data };
}

export async function persistJDtoDB(
	convex: ConvexHttpClient,
	args: {
		profileId?: Id<'profiles'>;
		fileName: string;
		fileSize: number;
		storageId: Id<'_storage'>;
		format: AllowedFileTypes;
		mimeType: string;
	}
) {
	const payload = {
		profileId: args.profileId ?? undefined,
		name: args.fileName,
		fileSize: args.fileSize,
		storageId: args.storageId,
		documentFormat: args.format,
		mimeType: args.mimeType,
		documentType: 'job_description' as const
	};
	return await convex.mutation(api.documents.upload.registerUpload, payload);
}
