<script lang="ts">
	import { Show, SignInButton, UserButton } from 'svelte-clerk';
</script>

<header class="pointer-events-auto absolute top-0 right-0 z-50 flex gap-4 p-6">
	<Show when="signed-out">
		<SignInButton />
	</Show>
	<Show when="signed-in">
		<UserButton />
	</Show>
</header>
