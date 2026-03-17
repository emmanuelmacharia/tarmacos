import { browser } from '$app/environment';

export class IsMobile {
	current = $state(false);

	#mediaQuery: MediaQueryList | null = null;
	#onChange = () => {
		this.current = this.#mediaQuery?.matches ?? false;
	};

	constructor(breakpoint = 768) {
		if (!browser) return;

		this.#mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

		this.#onChange();
		this.#mediaQuery.addEventListener('change', this.#onChange);
	}

	destroy() {
		this.#mediaQuery?.removeEventListener('change', this.#onChange);
	}
}
