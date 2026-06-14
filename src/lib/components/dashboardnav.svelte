<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import {
		Briefcase,
		ChevronLeft,
		ChevronRight,
		Ellipsis,
		History,
		PanelLeft,
		Pencil,
		Plus,
		Settings,
		Sparkles,
		Trash2,
		X
	} from '@lucide/svelte';
	import ProfileForm from './profileForm.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from './ui/button';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { toast } from 'svelte-sonner';
	import { getAppErrorMessage } from '$lib/utils/errorHandler';
	import type { Profile } from '$lib/data/models';

	const convex = useConvexClient();

	let isCollapsed = $state(false);
	let isMobileOpen = $state(false);
	let isModalOpen = $state(false);
	let editingProfile = $state<Profile | null>(null);
	let profilePendingDelete = $state<Profile | null>(null);
	let isDeleting = $state(false);

	let { profiles = [] as Profile[], activeProfile = $bindable<Profile | undefined>() } = $props();

	function openCreate() {
		editingProfile = null;
		isModalOpen = true;
	}

	function openEdit(profile: Profile) {
		editingProfile = profile;
		isModalOpen = true;
	}

	async function confirmDelete() {
		if (!profilePendingDelete) return;
		isDeleting = true;
		try {
			await convex.mutation(api.user.profiles.deleteProfile, {
				profileId: profilePendingDelete._id
			});
			if (activeProfile?._id === profilePendingDelete._id) {
				activeProfile = undefined;
			}
			toast.success('Profile deleted successfully');
			profilePendingDelete = null;
		} catch (error) {
			toast.error(getAppErrorMessage(error));
		} finally {
			isDeleting = false;
		}
	}

	let profilesState: Profile[] = $derived([...profiles]);

	let defaultActiveProfile: Profile = $derived(activeProfile ? activeProfile : profiles[0]);

	$effect(() => {
		if (!activeProfile && defaultActiveProfile) {
			activeProfile = defaultActiveProfile;
		}
	});

	const navItems = [
		{ label: 'Dashboard', href: '/dashboard', icon: Briefcase },
		// { label: 'Generations', href: '/dashboard/generations', icon: FileText },
		{ label: 'History', href: '/dashboard/history', icon: History }
	] as const;

	function activateProfile(id: string) {
		activeProfile = profiles.find((profile) => profile._id === id);
	}

	function closeMobileMenu() {
		isMobileOpen = false;
	}

	function isActive(href: string) {
		if (href === '/dashboard') {
			return page.url.pathname === href;
		}

		return page.url.pathname.startsWith(href);
	}

	function navItemClass(href: string) {
		return cn(
			'flex w-full items-center gap-3 rounded-lg px-2 py-4 text-muted-foreground transition-colors hover:font-bold cursor-pointer hover:text-foreground',
			isActive(href) && 'bg-primary/10 font-medium text-foreground'
		);
	}

	$effect(() => {
		document.body.style.overflow = isMobileOpen ? 'hidden' : '';

		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

{#snippet profileMenu(profile: Profile, triggerClass: string)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			aria-label="Profile actions"
			class={cn(
				'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background-secondary/10 hover:text-foreground focus:outline-none data-[state=open]:bg-background-secondary/10 data-[state=open]:text-foreground',
				triggerClass
			)}
		>
			<Ellipsis size={16} />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content
			align="end"
			class="min-w-36 rounded-md border border-border bg-background p-1"
		>
			<DropdownMenu.Item onSelect={() => openEdit(profile)} class="cursor-pointer">
				<Pencil size={14} />
				Edit
			</DropdownMenu.Item>
			<DropdownMenu.Item
				variant="destructive"
				onSelect={() => (profilePendingDelete = profile)}
				class="cursor-pointer"
			>
				<Trash2 size={14} />
				Delete
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<header
	class="sticky top-0 z-50 flex items-center justify-between border-b border-gray-300 bg-background/80 px-4 py-3 backdrop-blur md:hidden"
>
	<button
		type="button"
		aria-label="Open navigation menu"
		class="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:font-bold"
		onclick={() => (isMobileOpen = true)}
	>
		<PanelLeft size={18} />
	</button>

	<div class="flex items-center gap-2 font-semibold">
		<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
			<Sparkles size={16} class="text-primary-foreground" />
		</div>
		<span>Resume Tailor</span>
	</div>

	<div class="h-10 w-10"></div>
</header>

<button
	type="button"
	aria-label="Close navigation menu"
	class={cn(
		'fixed inset-0 z-50 bg-black/40 transition-opacity md:hidden',
		isMobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
	)}
	onclick={closeMobileMenu}
></button>

<aside
	class={cn(
		'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-300 bg-background shadow-xl transition-transform duration-300 md:hidden',
		isMobileOpen ? 'z-50 translate-x-0' : '-translate-x-full'
	)}
>
	<div class="flex items-center justify-between border-b border-gray-300 px-4 py-8">
		<div class="flex items-center gap-3">
			<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
				<Sparkles size={16} class="text-primary-foreground" />
			</div>
			<span class="text-lg font-bold">
				Resume <span class="opacity-70">Tailor</span>
			</span>
		</div>

		<button
			type="button"
			aria-label="Close navigation menu"
			class="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-background transition-colors hover:font-bold"
			onclick={closeMobileMenu}
		>
			<X size={18} />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto py-6">
		<div class="px-4">
			<div class="mb-3 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
				Job profiles
			</div>

			<div class="my-4 flex flex-col gap-2">
				{#each profilesState as profile (profile._id)}
					<div class="relative flex items-center">
						<button
							type="button"
							onclick={() => activateProfile(profile._id)}
							class={cn(
								'flex w-full items-center gap-3 rounded-lg p-2 pr-10 text-left transition-colors',
								profile._id === defaultActiveProfile._id
									? 'bg-primary/10 font-medium text-primary'
									: 'cursor-pointer text-muted-foreground hover:font-bold hover:text-foreground'
							)}
							aria-label={profile.name}
						>
							<span
								class={cn(
									'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background-secondary/5 text-lg',
									profile._id === defaultActiveProfile._id
										? 'border-primary/30 shadow-sm'
										: 'border-border'
								)}
							>
								🎨
							</span>
							<span class="truncate text-sm">{profile.name}</span>
						</button>
						{@render profileMenu(profile, 'absolute top-1/2 right-2 -translate-y-1/2')}
					</div>
				{/each}

				<button
					type="button"
					onclick={openCreate}
					aria-label="Add new profile"
					class="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-muted-foreground transition-colors hover:font-bold hover:text-foreground"
				>
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-500"
					>
						<Plus size={16} />
					</span>
					<span class="text-sm">Add New Role</span>
				</button>
			</div>
		</div>

		<div class="mt-6 border-t-2 border-gray-300 px-4 pt-6">
			<nav class="flex flex-col gap-1">
				{#each navItems as item (item.href)}
					<a
						href={resolve(item.href)}
						data-sveltekit-preload-data="hover"
						class={navItemClass(item.href)}
						onclick={closeMobileMenu}
					>
						<item.icon size={18} />
						<span class="text-sm font-medium">{item.label}</span>
					</a>
				{/each}
			</nav>
		</div>
	</div>

	<div class="mt-auto border-t-2 border-border p-4">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-muted-foreground transition-colors hover:font-bold hover:text-foreground"
		>
			<Settings size={18} />
			<span class="text-sm font-medium">Settings</span>
		</button>
	</div>
</aside>

<aside
	class={cn(
		'hidden h-screen shrink-0 border-r border-gray-300 bg-background-secondary/5 transition-[width] duration-300 md:flex md:flex-col',
		isCollapsed ? 'md:w-20' : 'md:w-64'
	)}
>
	<div
		class="relative flex items-center justify-center border-b-2 border-gray-300 p-4 md:justify-start md:gap-3 md:p-6"
	>
		<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
			<Sparkles size={16} class="text-primary-foreground" />
		</div>

		<span
			class={cn('text-lg font-bold whitespace-nowrap', isCollapsed ? 'hidden' : 'hidden md:block')}
		>
			Resume <span class="opacity-70">Tailor</span>
		</span>

		<button
			type="button"
			onclick={() => (isCollapsed = !isCollapsed)}
			aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
			class="absolute -right-3 hidden h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-background text-muted-foreground shadow-sm transition-transform hover:scale-110 hover:bg-muted hover:text-foreground md:flex"
		>
			{#if isCollapsed}
				<ChevronRight size={14} />
			{:else}
				<ChevronLeft size={14} />
			{/if}
		</button>
	</div>

	<div class="flex-1 overflow-y-auto py-6">
		<div class="px-3 md:px-4">
			<div
				class={cn(
					'mb-3 px-2 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase',
					isCollapsed ? 'hidden' : 'hidden md:block'
				)}
			>
				Job profiles
			</div>

			<div class="flex flex-col gap-2">
				{#each profilesState as profile (profile._id)}
					<div class="group relative flex items-center">
						<button
							type="button"
							onclick={() => activateProfile(profile._id)}
							class={cn(
								'flex w-full items-center gap-3 rounded-lg p-2 transition-colors',
								!isCollapsed && 'md:pr-9',
								profile._id === defaultActiveProfile._id
									? 'bg-primary/10 font-medium text-primary'
									: 'cursor-pointer text-muted-foreground hover:font-bold hover:text-foreground'
							)}
							aria-label={profile.name}
						>
							<span
								class={cn(
									'mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background-secondary/5 text-lg md:mx-0 md:h-8 md:w-8 md:text-base',
									profile._id === defaultActiveProfile._id
										? 'border-primary/30 shadow-sm'
										: 'border-border'
								)}
							>
								🎨
							</span>

							<span class={cn('truncate text-sm', isCollapsed ? 'hidden' : 'hidden md:block')}>
								{profile.name}
							</span>
						</button>
						{@render profileMenu(
							profile,
							cn(
								'absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
								isCollapsed && 'hidden'
							)
						)}
					</div>
				{/each}

				<button
					type="button"
					onclick={openCreate}
					aria-label="Add new profile"
					class="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-muted-foreground transition-colors hover:font-bold hover:text-foreground"
				>
					<span
						class="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-500 md:mx-0 md:h-8 md:w-8"
					>
						<Plus size={16} />
					</span>

					<span class={cn('text-sm whitespace-nowrap', isCollapsed ? 'hidden' : 'hidden md:block')}>
						Add New Role
					</span>
				</button>
			</div>
		</div>

		<div class="border-t-2 border-gray-300 px-3 pt-6 md:px-4">
			<nav class="flex flex-col gap-1">
				{#each navItems as item (item.href)}
					<a
						href={resolve(item.href)}
						data-sveltekit-preload-data="hover"
						class={navItemClass(item.href)}
					>
						<item.icon size={18} class="mx-auto md:mx-0" />

						<span class={cn('text-sm font-medium', isCollapsed ? 'hidden' : 'hidden md:block')}>
							{item.label}
						</span>
					</a>
				{/each}
			</nav>
		</div>
	</div>

	<div class="mt-auto w-full border-t-2 border-border p-4">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-muted-foreground transition-colors hover:font-bold hover:text-foreground"
		>
			<Settings size={18} class="mx-auto md:mx-0" />
			<span class={cn('text-sm font-medium', isCollapsed ? 'hidden' : 'hidden md:block')}>
				Settings
			</span>
		</button>
	</div>
</aside>

<div>
	<ProfileForm bind:isOpen={isModalOpen} profile={editingProfile} />
</div>

<Dialog.Root
	open={!!profilePendingDelete}
	onOpenChange={(open) => {
		if (!open) profilePendingDelete = null;
	}}
>
	<Dialog.Content class="bg-background p-4 backdrop-blur-xs sm:max-w-100">
		<Dialog.Header>
			<Dialog.Title class="text-xl font-bold">Delete profile</Dialog.Title>
			<Dialog.Description class="text-sm text-foreground">
				Are you sure you want to delete
				<span class="font-semibold">{profilePendingDelete?.name}</span>? This action cannot be
				undone.
			</Dialog.Description>
		</Dialog.Header>
		<div class="mt-6 flex justify-end gap-3">
			<Button
				type="button"
				variant="outline"
				class="border-primary/40"
				onclick={() => (profilePendingDelete = null)}
				disabled={isDeleting}
			>
				Cancel
			</Button>
			<Button type="button" variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting…' : 'Delete'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
