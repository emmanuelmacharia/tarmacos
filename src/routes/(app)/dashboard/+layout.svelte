<script lang="ts">
	import '../../layout.css';
	import Dashboardnav from '$lib/components/dashboardnav.svelte';
	import type { Profile } from '$lib/data/models.js';
	import { setProfileState } from '$lib/context/profile-state.js';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api.js';
	let { children, data } = $props();

	const reactiveProfiles = useQuery(api.user.profiles.fetchUserProfiles);

	const profiles: Profile[] | undefined = $derived(reactiveProfiles.data ?? data.profiles);

	const sharedProfileState = $state({
		activeUserProfile: null as Profile | null
	});

	setProfileState(sharedProfileState);
</script>

<main class="h-screen overflow-hidden bg-transparent font-sans text-foreground">
	<div class="flex h-full flex-col md:flex-row">
		<Dashboardnav {profiles} bind:activeProfile={sharedProfileState.activeUserProfile} />
		<div class="flex min-h-0 flex-1 overflow-hidden">
			<div class="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-6 md:px-8 md:py-10">
				{@render children()}
			</div>
		</div>
	</div>
</main>
