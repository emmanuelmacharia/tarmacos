<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";
import Paperclip from "$lib/icons/Paperclip.svelte";
	import Sparkles from "$lib/icons/Sparkles.svelte";

</script>

<div
	class="relative flex min-h-screen flex-col items-center justify-center p-6 font-sans text-foreground"
>
	<!-- Create a nav bar -->

	<div class="mx-auto flex w-full max-w-3xl flex-col items-center">
		<h1 class="mb-10 text-center text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
			What role are we targetting today?
		</h1>
		<div
			class="relative w-full rounded-2xl bg-background border border-primary/30 shadow-lg transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 hover:border-border"
		>
			<textarea
				rows="2"
				class="w-full resize-none bg-transparent p-4 text-lg leading-relaxed outline-none placeholder:text-muted-foreground/50 md:text-xl"
				placeholder="Paste a Job description of the role..."
			></textarea>
            <div class="flex items-center justify-between p-2 mt-2">
                <div class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg cursor-pointer transition">
                    <Paperclip size={18} />
					<span>Attach Baseline Resume</span>
                </div>
				<Button class='flex gap-4'>
					<Sparkles size={18} />
					Tailor resume
				</Button>
            </div>
		</div>
		<div class="mt-10 justify-center items-center gap-4">
			<button class="my-2 px-4 py-2 rounded-full border border-primary/30 bg-background text-sm font-medium hover:bg-muted/50 cursor-pointer transition-colors shadow-sm">Frontend Engineer at Stripe</button>
			<button class="my-2 px-4 py-2 rounded-full border border-primary/30 bg-background text-sm font-medium hover:bg-muted/50 cursor-pointer transition-colors shadow-sm">Product Designer at Apple</button>
			<button class="my-2 px-4 py-2 rounded-full border border-primary/30 bg-background text-sm font-medium hover:bg-muted/50 cursor-pointer transition-colors shadow-sm">Project Manager at Microsoft</button>
		</div>
	</div>
</div>
