<script lang="ts">
	import { goto } from '$app/navigation';
	import MainPrompt, { type AttachedFile } from '$lib/components/main-prompt.svelte';
	import { getProfileState } from '$lib/context/profile-state';
	import type { Role, SelectedModel } from '$lib/data/models';
	import type { StartWorkflowApiRequest } from '$lib/server/ai/workflow/api/types';
	import { resolve } from '$app/paths';

	const profileState = getProfileState();

	let activeUserProfile = $derived(profileState.activeUserProfile);

	$effect(() => console.log(activeUserProfile, profileState));

	const fileToBase64 = async (file: File) => {
		const bytes = new Uint8Array(await file.arrayBuffer());
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary);
	};

	const inferMimeType = (file: File) =>
		file.type ||
		({
			pdf: 'application/pdf',
			doc: 'application/msword',
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			md: 'text/markdown',
			markdown: 'text/markdown',
			txt: 'text.plain'
		}[file.name.split('.').pop()?.toLowerCase() ?? ''] ??
			'');

	async function handleSubmit(data: {
		jobDescription: string;
		jobInstructions: string;
		models: Record<Role, SelectedModel>;
		resume: AttachedFile;
		supportingDocuments: AttachedFile[];
	}) {
		const supportingDocumentsData = await Promise.all(
			data.supportingDocuments.map(async (doc) => {
				return {
					documentId: doc.documentId,
					fileName: doc.file.name,
					mimeType: inferMimeType(doc.file),
					purpose: 'supporting' as const,
					base64: await fileToBase64(doc.file)
				};
			})
		);

		const payload: StartWorkflowApiRequest = {
			profileId: activeUserProfile?._id,
			jobDescription: data.jobDescription,
			models: {
				reviewerModelSlug: data.models.reviewer.id ?? undefined,
				writerModelSlug: data.models.writer.id ?? undefined
			},
			jobInstructions: data.jobInstructions,
			baselineCv: {
				documentId: data.resume.documentId,
				fileName: data.resume.file.name,
				mimeType:
					data.resume.file.type ||
					data.resume.file.name.split('.')[data.resume.file.name.split('.').length - 1],
				purpose: 'resume' as const,
				base64: await fileToBase64(data.resume.file)
			},
			supportingDocuments: supportingDocumentsData
		};

		console.log(
			'weve got the payload right here ----> are we setting the file type correctly?',
			payload
		);

		// const route = resolve('/(app)/runs');

		// goto(route);
		startWorkflow(payload);
	}

	async function startWorkflow(payload: StartWorkflowApiRequest) {
		const url = '/api/ai/runs';
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok || !response.body) {
			console.log(response);
		}

		console.log(response, '\n', response.json);

		const data = await response.json();

		const { id } = data;

		if (!id) {
			console.log(data);
		}
		const route = resolve(`/runs/${id}`);

		goto(route);
	}
</script>

<div class="flex min-h-full flex-col justify-center">
	<MainPrompt onsubmit={handleSubmit} />
</div>
