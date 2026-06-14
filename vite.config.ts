import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Keep pdf-parse and its pdfjs-dist dependency out of the SSR bundle so they
	// load from node_modules at runtime. This keeps pdfjs module evaluation lazy
	// (so our DOMMatrix polyfill runs first) and lets Vercel's file tracer include
	// pdf.worker.mjs via the literal import in ensurePdfWorker().
	ssr: { external: ['pdf-parse', 'pdfjs-dist'] }
});
