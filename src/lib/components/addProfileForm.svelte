<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from './ui/button';
	import * as Field from './ui/field/index';
	import Input from './ui/input/input.svelte';
	import * as Select from './ui/select/index';
	import Textarea from './ui/textarea/textarea.svelte';

	let { isOpen = $bindable() } = $props();


	function handleSubmit(e: Event) {
		e.preventDefault();
		// Handle form submission logic here
	}

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
		<form class="grid w-full items-center gap-4 space-y-4 py-4" onsubmit={handleSubmit}>
			<Field.Group>
				<Field.Label for="name">Profile Name</Field.Label>
				<Input
					id="name"
					name="name"
					placeholder="e.g. Software Engineer, Product Manager, etc."
					required
					class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 text-foreground focus:border-0 focus:ring-0"
				/>
			</Field.Group>
			<Field.Group>
				<Field.Label for="summary" class="">Summary</Field.Label>
				<Textarea
					rows={2}
					id="summary"
					name="summary"
					placeholder="A brief summary of your profile, e.g. 'Experienced software engineer with a passion for building scalable web applications.'"
					class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
				/>
			</Field.Group>
			<Field.Group>
				<Field.Label for="primaryFocus" class="">Primary Focus</Field.Label>
				<Input
					id="primaryFocus"
					name="primaryFocus"
					placeholder="e.g. Frontend Development, Backend Development, Product Management, etc."
					class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
				/>
			</Field.Group>
			<div class="flex w-full gap-4">
				<Field.Group>
					<Field.Label for="yearsExperience" class="">Years of Experience</Field.Label>
					<Input
						id="yearsExperience"
						name="yearsExperience"
						type="number"
						placeholder="e.g. 3, 5, 10, etc."
						class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
					/>
				</Field.Group>
				<Field.Group>
					<Field.Label for="seniority" class="">Seniority</Field.Label>
					<Select.Root type="single" name="seniority">
						<Select.Trigger
							class="placeholder:text-foreground-muted w-full rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
						>
							Select seniority level
						</Select.Trigger>
						<Select.Content class="rounded-md border-2 border-primary/40 bg-background p-2">
							<Select.Item value="intern" class="p-2 hover:bg-background-secondary/10"
								>Intern</Select.Item
							>
							<Select.Item value="junior" class="p-2 hover:bg-background-secondary/10"
								>Junior</Select.Item
							>
							<Select.Item value="mid" class="p-2 hover:bg-background-secondary/10">Mid</Select.Item
							>
							<Select.Item value="senior" class="p-2 hover:bg-background-secondary/10"
								>Senior</Select.Item
							>
							<Select.Item value="staff" class="p-2 hover:bg-background-secondary/10"
								>Staff</Select.Item
							>
							<Select.Item value="principal" class="p-2 hover:bg-background-secondary/10"
								>Principal</Select.Item
							>
							<Select.Item value="lead" class="p-2 hover:bg-background-secondary/10"
								>Lead</Select.Item
							>
							<Select.Item value="manager" class="p-2 hover:bg-background-secondary/10"
								>Manager</Select.Item
							>
						</Select.Content>
					</Select.Root>
				</Field.Group>
			</div>
			<Field.Group>
				<Field.Label for="writer-prompt">Writer Prompt</Field.Label>
				<Textarea
					rows={2}
					id="writer-prompt"
					name="writer-prompt"
					placeholder="Tell the writer LLM what skills to focus on, what tone to use, and any other relevant information to help it draft a better resume for you e.g. 'Focus on highlighting my experience with React and Node.js, and use a professional tone that emphasizes my leadership skills.'"
					class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
				/>
			</Field.Group>
			<Field.Group>
				<Field.Label for="reviewer-prompt">Reviewer Prompt</Field.Label>
				<Textarea
					rows={2}
					id="reviewer-prompt"
					name="reviewer-prompt"
					placeholder="Tell the reviewer LLM what criteria to use when reviewing your resume, e.g. 'Focus on clarity and conciseness, and make sure to highlight relevant skills and experience for the target job.'"
					class="placeholder:text-foreground-muted rounded-sm border-2 border-primary/40 py-2 text-foreground focus:border-0 focus:ring-0"
				/>
			</Field.Group>

            <div class="mt-8 flex justify-end gap-3">
				<Button type="button" variant="outline" onclick={handleCancel} class="border-primary/40">
					Cancel
				</Button>
				<Button type="submit">Save Profile</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
