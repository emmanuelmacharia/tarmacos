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
	const sections: CanonicalResumeSection[] = doc.sections
		.map((raw) => {
			const s = (raw ?? {}) as { kind?: unknown; title?: unknown; lines?: unknown };
			return {
				kind: (typeof s.kind === 'string' ? s.kind : 'other') as CanonicalResumeSectionKind,
				title: typeof s.title === 'string' ? s.title : '',
				lines: Array.isArray(s.lines)
					? s.lines.filter((l): l is string => typeof l === 'string')
					: []
			};
		})
		.map((section) =>
			section.kind === 'header' ? { ...section, lines: splitHeaderLines(section.lines) } : section
		);

	return {
		schemaVersion: typeof doc.schemaVersion === 'string' ? doc.schemaVersion : '0',
		sections
	};
}

/**
 * The freeform-draft normaliser frequently leaves the candidate's name glued to
 * the contact details on the header's first line — the source rarely delimits
 * them (e.g. `**Jane Doe**Nairobi · +254… · jane@x.com`). Peel the name onto its
 * own line so the template styles it as the heading instead of running it into
 * the address/phone/email. The leading bold span is the near-universal way a
 * resume marks the name, so that's the primary signal; a wholly delimited single
 * line is the fallback. A header that's already split is returned untouched.
 */
function splitHeaderLines(lines: string[]): string[] {
	if (lines.length === 0) return lines;
	const [first, ...rest] = lines;

	// Name in a leading bold span, with contact details run on directly after it.
	const bold = first.match(/^\s*\*\*\s*(.+?)\s*\*\*\s*(.*)$/);
	if (bold) {
		const name = bold[1].trim();
		// drop a separator the source may have placed between name and contact
		const remainder = bold[2].replace(/^[|·•\-–—,;:\s]+/, '').trim();
		return remainder ? [name, remainder, ...rest] : [name, ...rest];
	}

	// No bold, but the whole header sits on one delimited line ("Name · a · b").
	if (rest.length === 0) {
		const parts = first
			.split(/\s*[|·•]\s*/)
			.map((part) => part.trim())
			.filter(Boolean);
		if (parts.length > 1) return parts;
	}

	return lines;
}

/**
 * A "thematic break" line — a markdown horizontal rule (`---`, `***`, `___`, or
 * longer). These are pure formatting noise once the resume is laid out by the
 * template, so they're dropped rather than rendered as empty bullets.
 */
function isThematicBreak(line: string): boolean {
	return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

/** Apply inline markdown emphasis to already-escaped text. */
function applyEmphasis(html: string): string {
	// bold before italic so `**` is consumed before the single-`*` pass runs
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	// underscore italic only when not glued to word characters (avoids mangling
	// identifiers/emails like some_value)
	html = html.replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<em>$2</em>');
	return html;
}

// Only these schemes are allowed through as real links — anything else (e.g.
// `javascript:`) is rendered as inert text so a draft can't inject script.
const SAFE_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
// `[label](url)` with the URL constrained to a safe scheme and stopping at the
// first whitespace/`)` so trailing prose isn't swallowed.
const MARKDOWN_LINK = /\[([^\]]+)\]\(\s*((?:https?:\/\/|mailto:)[^\s)]+)\s*\)/g;

/**
 * The "handle" shown as the anchor text: the URL's last path segment (e.g.
 * github.com/jane → "jane"), falling back to the bare host for a domain-only URL
 * (jane.com → "jane.com") or the address for a mailto link.
 */
function linkHandle(url: URL): string {
	if (url.protocol === 'mailto:') return url.pathname;
	const segments = url.pathname.split('/').filter(Boolean);
	const last = segments[segments.length - 1];
	if (last) {
		try {
			return decodeURIComponent(last);
		} catch {
			return last;
		}
	}
	return url.hostname.replace(/^www\./, '');
}

/**
 * Render a markdown link as `Label: <a href="url">handle</a>` — the label keeps
 * the link's purpose visible and the handle exposes the destination, which is
 * essential on a printed/PDF resume where the anchor isn't clickable. An
 * unparseable or unsafe URL degrades to plain emphasised label text.
 */
function renderLink(label: string, rawUrl: string): string {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return applyEmphasis(escapeHtml(label));
	}
	if (!SAFE_LINK_SCHEMES.has(url.protocol)) return applyEmphasis(escapeHtml(label));
	const safeLabel = applyEmphasis(escapeHtml(label));
	const href = escapeHtml(rawUrl);
	const handle = escapeHtml(linkHandle(url));
	return `${safeLabel}: <a href="${href}">${handle}</a>`;
}

/**
 * Render one resume line: strip leading block markers (the surrounding `<li>`
 * already conveys "this is a bullet", so a literal `-`/`*`/`•`, heading `#`, or
 * blockquote `>` would just be noise), turn markdown links into `<a>` tags, and
 * translate inline emphasis into real tags. Non-link text is HTML-escaped *first*
 * so resume data can never inject markup; links go through the scheme-checked
 * `renderLink`. Emphasis is only applied to the escaped gaps between links, never
 * to the generated anchor markup.
 */
function renderLine(rawLine: string): string {
	const stripped = rawLine
		.replace(/^\s*[-*•]\s+/, '') // unordered-list marker
		.replace(/^\s*#{1,6}\s+/, '') // ATX heading hashes
		.replace(/^\s*>\s?/, ''); // blockquote marker

	let out = '';
	let lastIndex = 0;
	for (const match of stripped.matchAll(MARKDOWN_LINK)) {
		const [full, label, url] = match;
		out += applyEmphasis(escapeHtml(stripped.slice(lastIndex, match.index)));
		out += renderLink(label, url);
		lastIndex = match.index + full.length;
	}
	out += applyEmphasis(escapeHtml(stripped.slice(lastIndex)));
	return out;
}

function renderSection(section: CanonicalResumeSection): string {
	const lines = section.lines
		.filter((line) => !isThematicBreak(line))
		.map((line) => `<li>${renderLine(line)}</li>`)
		.join('');
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
