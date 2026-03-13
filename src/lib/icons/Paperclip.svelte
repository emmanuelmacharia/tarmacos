<script lang="ts">
	import Icon from './Icon.svelte';

	type Props = {
		class?: string;
		size?: number | string;
		strokeWidth?: number | string;
		ariaLabel?: string;
	};

	let { class: className = '', size = 20, strokeWidth = 2, ariaLabel }: Props = $props();
</script>

<Icon class={className} {size} {strokeWidth} {ariaLabel}>
   <path d="m16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>
</Icon>
