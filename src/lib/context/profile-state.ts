// src/lib/context/profile-state.ts
import { getContext, setContext } from 'svelte';
import type { Profile } from '$lib/data/models.js';

const PROFILE_STATE_KEY = Symbol('profile-state');

export type ProfileState = {
	activeUserProfile: Profile | null;
};

export function setProfileState(state: ProfileState) {
	setContext(PROFILE_STATE_KEY, state);
}

export function getProfileState() {
	return getContext<ProfileState>(PROFILE_STATE_KEY);
}
