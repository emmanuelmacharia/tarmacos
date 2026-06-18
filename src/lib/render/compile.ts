/**
 * Isomorphic resume → HTML compiler.
 *
 * This is the heart of the WYSIWYG guarantee (plan §2 Q2): the export pipeline
 * and the client-side preview both run the *same* template over the *same*
 * `canonicalJson`, so what the user previews is byte-for-byte what the renderer
 * turns into a PDF/DOCX. It has no DOM or Node dependencies so it runs in the
 * SvelteKit server (export build) and the browser (iframe preview) alike.
 *
 * Template contract: a template asset is a complete HTML document containing any
 * of these tokens, which the compiler substitutes:
 *   - `{{RESUME_NAME}}`     → the candidate name (first line of the header section)
 *   - `{{RESUME_CONTACT}}`  → remaining header lines, joined with " · "
 *   - `{{RESUME_SECTIONS}}` → the full compiled section markup
 * If `{{RESUME_SECTIONS}}` is absent the sections are injected before `</body>`
 * (or appended) so a minimal template still produces output.
 */

export type CanonicalResumeSectionKind =
	| 'header'
	| 'summary'
	| 'experience'
	| 'skills'
	| 'education'
	| 'projects'
	| 'certifications'
	| 'other';

export interface CanonicalResumeSection {
	kind: CanonicalResumeSectionKind;
	title: string;
	lines: string[];
}

export interface CanonicalResumeDocument {
	schemaVersion: string;
	sections: CanonicalResumeSection[];
}

const SECTIONS_TOKEN = '{{RESUME_SECTIONS}}';
const NAME_TOKEN = '{{RESUME_NAME}}';
const CONTACT_TOKEN = '{{RESUME_CONTACT}}';

/** Escape text for safe interpolation into HTML (data is never trusted markup). */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Parse the stored canonical JSON (a JSON string on `artifactVersions`) into a
 * validated document. Throws on anything that isn't the expected shape so the
 * caller surfaces a clear build error rather than rendering garbage.
 */
export function parseCanonicalResume(canonicalJson: string): CanonicalResumeDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(canonicalJson);
	} catch {
		throw new Error('canonicalJson is not valid JSON');
	}
	// canonicalJson is occasionally double-encoded upstream; unwrap one layer.
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			throw new Error('canonicalJson is not valid JSON');
		}
	}

	if (
		!parsed ||
		typeof parsed !== 'object' ||
		!Array.isArray((parsed as { sections?: unknown }).sections)
	) {
		throw new Error('canonicalJson is missing a sections array');
	}

	const doc = parsed as { schemaVersion?: unknown; sections: unknown[] };
	const sections: CanonicalResumeSection[] = doc.sections.map((raw) => {
		const s = (raw ?? {}) as { kind?: unknown; title?: unknown; lines?: unknown };
		return {
			kind: (typeof s.kind === 'string' ? s.kind : 'other') as CanonicalResumeSectionKind,
			title: typeof s.title === 'string' ? s.title : '',
			lines: Array.isArray(s.lines) ? s.lines.filter((l): l is string => typeof l === 'string') : []
		};
	});

	return {
		schemaVersion: typeof doc.schemaVersion === 'string' ? doc.schemaVersion : '0',
		sections
	};
}

function renderSection(section: CanonicalResumeSection): string {
	const lines = section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
	const body = lines ? `<ul class="resume-lines">${lines}</ul>` : '';

	// the header is rendered chrome-free; its content drives the name/contact tokens
	if (section.kind === 'header') {
		return `<header class="resume-header">${body}</header>`;
	}

	const heading = section.title
		? `<h2 class="resume-heading">${escapeHtml(section.title)}</h2>`
		: '';
	return `<section class="resume-section resume-section--${escapeHtml(section.kind)}">${heading}${body}</section>`;
}

function renderSections(doc: CanonicalResumeDocument): string {
	return doc.sections.map(renderSection).join('\n');
}

/** Derive the candidate name + contact line from the header section, if any. */
function deriveHeader(doc: CanonicalResumeDocument): { name: string; contact: string } {
	const header = doc.sections.find((s) => s.kind === 'header');
	if (!header || header.lines.length === 0) return { name: '', contact: '' };
	const [name, ...rest] = header.lines;
	return { name: name ?? '', contact: rest.join(' · ') };
}

/**
 * Compile a template asset + canonical resume into a single, fully-resolved HTML
 * document ready to send to the renderer (or load into a preview iframe).
 */
export function compileResumeHtml(templateHtml: string, canonicalJson: string): string {
	const doc = parseCanonicalResume(canonicalJson);
	const sectionsHtml = renderSections(doc);
	const { name, contact } = deriveHeader(doc);

	let html = templateHtml
		.split(NAME_TOKEN)
		.join(escapeHtml(name))
		.split(CONTACT_TOKEN)
		.join(escapeHtml(contact));

	if (html.includes(SECTIONS_TOKEN)) {
		html = html.split(SECTIONS_TOKEN).join(sectionsHtml);
	} else if (html.includes('</body>')) {
		html = html.replace('</body>', `${sectionsHtml}</body>`);
	} else {
		html = `${html}\n${sectionsHtml}`;
	}

	return html;
}
