// we need to process the JD; convert it into a file that we can save in run documents

import type { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

export async function createFileFromJD(
	convex: ConvexHttpClient,
	args: { text: string; filename: string }
) {
	console.log(convex);
	const file = await convex.action(api.runs.runDocuments.saveTextFile, { ...args });
	return file;
}
