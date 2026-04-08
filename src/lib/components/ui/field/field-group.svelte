<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="field-group"
	class={cn(
		'group/field-group @container/field-group flex w-full flex-col gap-1 data-[slot=checkbox-group]:gap-1 *:data-[slot=field-group]:gap-1',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
