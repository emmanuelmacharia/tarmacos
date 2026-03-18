<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';

	const routes = { dashboard: '/dashboard', generations: '/generations', history: 'history' };
</script>

<header class="pointer-events-auto">
	<nav>
		<ButtonGroup.Root class="bg-transparent px-4 py-6">
			<ButtonGroup.Root>
				<a href={resolve('/dashboard')} data-sveltekit-preload-data="hover">
					<Button
						class={cn(
							'rounded-none border border-primary/30',
							page.url.pathname === routes.dashboard
								? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground/90'
								: 'bg-transparent hover:bg-gray-50/50'
						)}
						size="lg"
						variant="outline">Dashboard</Button
					>
				</a>
				<a href={resolve('/dashboard/generations')} data-sveltekit-preload-data="hover">
					<Button
						class={cn(
							'rounded-none border border-primary/30 transition-colors',
							page.url.pathname.includes(routes.generations)
								? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground/90'
								: 'bg-transparent hover:bg-gray-50/50'
						)}
						size="lg"
						variant="outline">Generations</Button
					>
				</a>
				<a href={resolve('/dashboard/history')} data-sveltekit-preload-data="hover">
					<Button
						class={cn(
							'rounded-none border border-primary/30 transition-colors',
							page.url.pathname.includes(routes.history)
								? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground/90'
								: 'bg-transparent hover:bg-gray-50/50'
						)}
						size="lg"
						variant="outline">History</Button
					>
				</a>
			</ButtonGroup.Root>
		</ButtonGroup.Root>
	</nav>
</header>
