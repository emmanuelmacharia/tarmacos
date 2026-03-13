<script lang="ts">
	type Props = {
		class?: string;
		size?: number | string;
		strokeWidth?: number | string;
		viewBox?: string;
		fill?: string;
		stroke?: string;
		ariaLabel?: string;
		role?: string;
		children?: import('svelte').Snippet;
	};

	let {
		class: className = '',
		size = 20,
		strokeWidth = 2,
		viewBox = '0 0 24 24',
		fill = 'none',
		stroke = 'currentColor',
		ariaLabel,
		role = ariaLabel ? 'img' : 'presentation',
		children
	}: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	{viewBox}
	{fill}
	{stroke}
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	{role}
	aria-label={ariaLabel}
	aria-hidden={ariaLabel ? undefined : 'true'}
>
	{@render children?.()}
</svg>
