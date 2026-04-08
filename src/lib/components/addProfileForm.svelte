<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import z from 'zod';
	import { Button } from './ui/button';
	import * as Field from './ui/field/index';
	import Input from './ui/input/input.svelte';
	import * as Select from './ui/select/index';
	import Textarea from './ui/textarea/textarea.svelte';
	import { useConvexClient } from 'convex-svelte';
	import { createForm } from '@tanstack/svelte-form';
	import { api } from '../../convex/_generated/api';
	import { toast } from 'svelte-sonner';
	import { getAppErrorMessage } from '$lib/utils/errorHandler';
	import type { Level } from '$lib/data/models';

	const convex = useConvexClient();

	let { isOpen = $bindable(), allUserProfiles = $bindable() } = $props();

	const seniorityLevel = [
		'intern',
		'junior',
		'mid',
		'senior',
		'staff',
		'principal',
		'lead',
		'manager'
	] as const;

	const formSchema = z.object({
		name: z.string().min(1, 'Profile name is required'),
		summary: z.string().optional(),
		primaryFocus: z.string().optional(),
		yearsExperience: z.number().optional(),
		seniority: z
			.union([
				z.literal('intern'),
				z.literal('junior'),
				z.literal('mid'),
				z.literal('senior'),
				z.literal('staff'),
				z.literal('principal'),
				z.literal('lead'),
				z.literal('manager')
			])
			.optional(),
		writerPrompt: z.string().optional(),
		reviewerPrompt: z.string().optional()
	});

	type formInput = z.infer<typeof formSchema>;

	const form = createForm(() => ({
		defaultValues: {
			name: '',
			summary: '',
			primaryFocus: '',
			yearsExperience: undefined,
			seniority: undefined,
			writerPrompt: '',
			reviewerPrompt: ''
		} as formInput,
		validators: {
			onSubmit: formSchema
		},
		onSubmit: async ({ value }) => {
			// Handle form submission logic here, e.g. send data to server or update state
			const payload = {
				profileReaderPrompt: value.reviewerPrompt,
				profileWriterPrompt: value.writerPrompt,
				seniorityLevel: value.seniority,
				yearsOfExperience: value.yearsExperience,
				name: value.name,
				primaryFocus: value.primaryFocus,
				summary: value.summary
			};
			try {
				const profiles = await convex.mutation(api.user.profiles.createProfile, payload);
				toast.success('profile created successfully');
				allUserProfiles = profiles.data;
				isOpen = false;
			} catch (error) {
				const message = getAppErrorMessage(error);
				toast.error(message);
			}
		}
	}));

	function handleCancel() {
		isOpen = false;
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content class="bg-background p-4 backdrop-blur-xs sm:max-w-100 md:max-w-200">
		<Dialog.Header>
			<Dialog.Title class="text-2xl font-bold">Create target profile</Dialog.Title>
			<Dialog.Description class="text-sm text-foreground">
				Define the skills and requirements for your target job and customize your ai experience.
			</Dialog.Description>
		</Dialog.Header>
		<form
			id="profile-form"
			class="grid w-full items-center gap-4 space-y-4 py-4"
			onsubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<form.Field
				name="name"
				validators={{
					onChange: ({ value }) =>
						value.length < 3 ? 'Profile name must be at least 3 characters' : undefined,
					onChangeAsyncDebounceMs: 300
				}}
			>
				{#snippet children(field)}
					<Field.Group>
						<Field.Label for={field.name}
							>Profile Name <span class="text-destructive">*</span></Field.Label
						>
						<Input
							id="name"
							name={field.name}
							value={field.state.value}
							onblur={() => field.handleBlur()}
							oninput={(e: Event) => {
								const target = e.target as HTMLInputElement;
								field.handleChange(target.value);
							}}
							placeholder="e.g. Software Engineer, Product Manager, etc."
							required
							class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 text-foreground focus:border-0 focus:ring-0"
						/>
					</Field.Group>
				{/snippet}
			</form.Field>
			<form.Field
				name="summary"
				validators={{
					onChange: ({ value }) =>
						value && value.length < 3 ? 'The summary must be at least 3 characters' : undefined,
					onChangeAsyncDebounceMs: 300
				}}
			>
				{#snippet children(field)}
					<Field.Group>
						<Field.Label for={field.name} class="">Summary</Field.Label>
						<Textarea
							rows={2}
							id="summary"
							name={field.name}
							value={field.state.value}
							onblur={() => field.handleBlur()}
							oninput={(e: Event) => {
								const target = e.target as HTMLTextAreaElement;
								field.handleChange(target.value);
							}}
							placeholder="A brief summary of your profile, e.g. 'Experienced software engineer with a passion for building scalable web applications.'"
							class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
						/>
					</Field.Group>
				{/snippet}
			</form.Field>
			<form.Field
				name="primaryFocus"
				validators={{
					onChange: ({ value }) =>
						value && value.length < 3
							? 'The primary focus of this profile must be at least 3 characters'
							: undefined,
					onChangeAsyncDebounceMs: 300
				}}
			>
				{#snippet children(field)}
					<Field.Group>
						<Field.Label for={field.name} class="">Primary Focus</Field.Label>
						<Input
							id={field.name}
							name={field.name}
							value={field.state.value}
							onblur={() => field.handleBlur()}
							oninput={(e: Event) => {
								const target = e.target as HTMLInputElement;
								field.handleChange(target.value);
							}}
							placeholder="e.g. Frontend Development, Backend Development, Product Management, etc."
							class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
						/>
					</Field.Group>
				{/snippet}
			</form.Field>
			<div class="flex w-full gap-4">
				<form.Field
					name="yearsExperience"
					validators={{
						onChange: ({ value }) =>
							value && !isNaN(Number(value)) && value < 0
								? 'Years of experience must be more than 0'
								: undefined,
						onChangeAsyncDebounceMs: 300
					}}
				>
					{#snippet children(field)}
						<Field.Group>
							<Field.Label for={field.name} class="">Years of Experience</Field.Label>
							<Input
								id={field.name}
								name={field.name}
								type="number"
								value={field.state.value}
								onblur={() => field.handleBlur()}
								oninput={(e: Event) => {
									const target = e.target as HTMLInputElement;
									const val = target.value;
									let exp = Number(val);
									if (!isNaN(exp)) {
										field.handleChange(exp);
										return;
									} else {
										field.removeValue(0);
									}
								}}
								placeholder="e.g. 3, 5, 10, etc."
								class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
							/>
						</Field.Group>
					{/snippet}
				</form.Field>
				<form.Field name="seniority">
					{#snippet children(field)}
						<Field.Group>
							<Field.Label for={field.name} class="">Seniority</Field.Label>
							<Select.Root
								type="single"
								name={field.name}
								value={field.state.value}
								onValueChange={(val) => field.handleChange(val as Level)}
								onOpenChange={() => field.handleBlur()}
							>
								<Select.Trigger
									class="placeholder:text-foreground-muted w-full rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
								>
									{field.state.value || 'Select seniority level'}
								</Select.Trigger>
								<Select.Content class="rounded-md border-2 border-primary/40 bg-background p-2">
									{#each seniorityLevel as level (level)}
										<Select.Item value={level} class="p-2 hover:bg-background-secondary/10"
											>{level}</Select.Item
										>
									{/each}
								</Select.Content>
							</Select.Root>
						</Field.Group>
					{/snippet}
				</form.Field>
			</div>
			<form.Field
				name="writerPrompt"
				validators={{
					onChange: ({ value }) =>
						value && value.length < 3 ? 'The summary must be at least 3 characters' : undefined,
					onChangeAsyncDebounceMs: 300
				}}
			>
				{#snippet children(field)}
					<Field.Group>
						<Field.Label for={field.name}>Writer Prompt</Field.Label>
						<Textarea
							rows={2}
							id={field.name}
							name={field.name}
							value={field.state.value}
							onblur={() => field.handleBlur()}
							oninput={(e: Event) => {
								const target = e.target as HTMLTextAreaElement;
								field.handleChange(target.value);
							}}
							placeholder="Tell the writer LLM what skills to focus on, what tone to use, and any other relevant information to help it draft a better resume for you e.g. 'Focus on highlighting my experience with React and Node.js, and use a professional tone that emphasizes my leadership skills.'"
							class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
						/>
					</Field.Group>
				{/snippet}
			</form.Field>
			<form.Field
				name="reviewerPrompt"
				validators={{
					onChange: ({ value }) =>
						value && value.length < 3 ? 'The summary must be at least 3 characters' : undefined,
					onChangeAsyncDebounceMs: 300
				}}
			>
				{#snippet children(field)}
					<Field.Group>
						<Field.Label for={field.name}>Reviewer Prompt</Field.Label>
						<Textarea
							rows={2}
							id={field.name}
							name={field.name}
							value={field.state.value}
							onblur={() => field.handleBlur()}
							oninput={(e: Event) => {
								const target = e.target as HTMLTextAreaElement;
								field.handleChange(target.value);
							}}
							placeholder="Tell the reviewer LLM what criteria to use when reviewing your resume, e.g. 'Focus on clarity and conciseness, and make sure to highlight relevant skills and experience for the target job.'"
							class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
						/>
					</Field.Group>
				{/snippet}
			</form.Field>

			<div class="mt-8 flex justify-end gap-3">
				<Button type="button" variant="outline" onclick={handleCancel} class="border-primary/40">
					Cancel
				</Button>
				<Button type="submit" size="lg" class="px-6 py-4">Save Profile</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
