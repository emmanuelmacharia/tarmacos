<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';
	import { useClerkContext } from 'svelte-clerk';
	import MainPrompt from '$lib/components/main-prompt.svelte';
	import { startRun, type PromptSubmission } from '$lib/utils/startRun';
	import { BadgeCheck, History, PenLine, Scissors } from '@lucide/svelte';
	import posthog from 'posthog-js';

	const clerk = useClerkContext();
	const convex = useConvexClient();

	const session = $derived(clerk.session);
	const user = $derived(clerk.user);
	let syncedUser = $state<string | null>(null);

	$effect(() => {
		if (!session || !user?.id) return;
		if (syncedUser === user.id) return;
		void (async () => {
			try {
				await convex.mutation(api.user.user.createUser, {});
				syncedUser = user.id;
				posthog.identify(user.id, {
					email: user.primaryEmailAddress?.emailAddress,
					name: user.fullName ?? undefined
				});
			} catch (err) {
				// we'll add helpers for error handling
				console.log(err);
			}
		})();
	});

	// MainPrompt only calls onsubmit for signed-in users; visitors get the
	// sign-in modal and their draft is restored on the dashboard afterwards.
	async function handleSubmit(data: PromptSubmission) {
		await startRun(data);
	}

	const features = [
		{
			icon: PenLine,
			title: 'Drafted by a writer',
			body: 'A writer model reshapes your experience around what the role actually asks for.'
		},
		{
			icon: BadgeCheck,
			title: 'Challenged by a reviewer',
			body: 'A second model sends every draft back until it holds up — you only see work that passed.'
		},
		{
			icon: History,
			title: 'Versioned like code',
			body: 'Every revision is kept. Compare versions and download the one that fits best.'
		}
	];
</script>

<div class="relative flex h-svh flex-col overflow-hidden px-4 font-sans text-foreground md:px-6">
	<!-- warm glow behind the hero -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-144"
		style="background: radial-gradient(42rem 22rem at 50% 8rem, color-mix(in oklch, var(--color-background-secondary) 16%, transparent), transparent 70%);"
		aria-hidden="true"
	></div>

	<!-- wordmark, paired with the floating auth buttons from the nav -->
	<div class="absolute top-0 left-0 z-50 flex items-center gap-2 p-4 md:p-6">
		<span
			class="flex h-8 w-8 items-center justify-center rounded-lg bg-background-secondary/80 text-primary-foreground shadow-md"
		>
			<Scissors size={15} />
		</span>
		<span class="text-base font-semibold tracking-tight">Resume tailor</span>
	</div>

	<!-- hero + prompt, centered in the remaining viewport; scrolls internally
	     only if the editor is expanded beyond the available height -->
	<section
		class="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center overflow-y-auto"
	>
		<div class="my-auto flex w-full flex-col items-center pt-16 pb-4">
			<h1
				class="max-w-3xl text-center text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl"
			>
				Every role deserves a <span class="hero-accent">custom fit</span>.
			</h1>

			<p
				class="mt-3 max-w-2xl text-center text-sm text-balance text-muted-foreground md:mt-5 md:text-base"
			>
				Paste a job description and attach your resume — a writers&rsquo; room of AI models drafts,
				reviews, and presses a version cut for that job.
			</p>

			<div class="mt-6 w-full md:mt-8">
				<MainPrompt onsubmit={handleSubmit} showHeading={false} />
			</div>

			<p class="mt-3 text-center text-xs text-muted-foreground">
				You&rsquo;ll be asked to sign in before your first run — anything you&rsquo;ve typed comes
				with you.
			</p>
		</div>
	</section>

	<!-- features as a quiet strip; bodies appear on larger screens -->
	<footer class="mx-auto w-full max-w-5xl shrink-0 pb-5 [@media(max-height:620px)]:hidden">
		<svg
			class="w-full text-primary/30"
			height="14"
			viewBox="0 0 600 14"
			fill="none"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path
				d="M0 7 C 50 1, 100 13, 150 7 C 200 1, 250 13, 300 7 C 350 1, 400 13, 450 7 C 500 1, 550 13, 600 7"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-dasharray="6 8"
			/>
		</svg>

		<div class="mt-4 flex flex-wrap items-start justify-center gap-x-8 gap-y-2 md:gap-x-12">
			{#each features as feature (feature.title)}
				<div class="flex flex-col items-center gap-1.5 md:max-w-56">
					<div class="flex items-center gap-2">
						<feature.icon size={14} class="text-primary" />
						<span class="text-sm font-semibold tracking-tight">{feature.title}</span>
					</div>
					<p class="hidden text-center text-xs leading-relaxed text-muted-foreground md:block">
						{feature.body}
					</p>
				</div>
			{/each}
		</div>
	</footer>
</div>

<style>
	.hero-accent {
		background: linear-gradient(
			100deg,
			var(--color-background-secondary),
			var(--color-primary) 80%
		);
		background-clip: text;
		-webkit-background-clip: text;
		color: transparent;
	}
</style>
