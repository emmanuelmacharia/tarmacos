import { z, type ZodError } from 'zod';
import { SCHEMA_VERSIONS, MESSAGE_LIMITS } from './constants';
import type { OutputStrategy } from './types';
import {
	CritiqueAndPlanSchema,
	ReviewSchema,
	type CritiquePlan,
	type ReviewResult
} from '../schemas';

export type NormalizedCritiquePlan = CritiquePlan;
export type NormalizedReviewResult = ReviewResult;

export type CanonicalResumeSectionKind =
	| 'header'
	| 'summary'
	| 'experience'
	| 'skills'
	| 'education'
	| 'projects'
	| 'certifications'
	| 'other';

export type CanonicalResumeSection = {
	kind: CanonicalResumeSectionKind;
	title: string;
	lines: string[];
};

export type CanonicalResumeDocument = {
	schemaVersion: typeof SCHEMA_VERSIONS.resume;
	sections: CanonicalResumeSection[];
};

export type NormalizedDraft = {
	canonicalJson: CanonicalResumeDocument;
	markdown: string;
	plainText: string;
	previewText: string;
};

export type NormalizationResult<T> =
	| {
			ok: true;
			data: T;
			strategy: OutputStrategy;
	  }
	| {
			ok: false;
			error: string;
			repairable: boolean;
			strategy: OutputStrategy;
			zodErrors?: ZodError;
	  };

export function normalizeCritiquePlan(
	raw: unknown,
	strategy: OutputStrategy
): NormalizationResult<NormalizedCritiquePlan> {
	const parsed = extractAndParse(raw, CritiqueAndPlanSchema, strategy);
	if (!parsed.ok) return parsed;
	const data = {
		...parsed.data,
		strengthsToEmphasize: dedupeString(parsed.data.strengthsToEmphasize).slice(0, 12),
		targetKeywords: dedupeString(parsed.data.targetKeywords).slice(0, 30),
		experiencePriorities: dedupeString(parsed.data.experiencePriorities).slice(0, 12),
		writerStrategy: dedupeString(parsed.data.writerStrategy).slice(0, 12),
		factualGuardrails: dedupeString(parsed.data.factualGuardrails).slice(0, 12),
		resumeAlignmentScore: clamp(parsed.data.resumeAlignmentScore, 0, 100),
		keywordMatchScore: clamp(parsed.data.keywordMatchScore, 0, 100),
		yearsOfExperienceScore: clamp(parsed.data.yearsOfExperienceScore, 0, 100)
	};
	if (data.writerStrategy.length === 0) {
		return {
			ok: false,
			error: 'Critique plan must include at least one writer strategy.',
			repairable: true,
			strategy
		};
	}

	return { ok: true, data, strategy };
}

export function normalizeReviewResult(
	raw: unknown,
	strategy: OutputStrategy
): NormalizationResult<NormalizedReviewResult> {
	const parsed = extractAndParse(raw, ReviewSchema, strategy);
	if (!parsed.ok) return parsed;

	const data = {
		...parsed.data,
		resumeAlignmentScore: clamp(parsed.data.resumeAlignmentScore, 0, 100),
		keywordMatchScore: clamp(parsed.data.keywordMatchScore, 0, 100),
		yearsOfExperienceScore: clamp(parsed.data.yearsOfExperienceScore, 0, 100),
		handoffInstructions: dedupeString(parsed.data.handoffInstructions).slice(0, 10)
	};

	if (data.verdict === 'revise') {
		if (!data.blockingIssues || data.blockingIssues.length === 0) {
			return {
				ok: false,
				error:
					'Review verdict is "revise" but no blocking issues were provided. Please provide at least one blocking issue to guide the revision.',
				repairable: true,
				strategy
			};
		}

		if (!data.handoffInstructions || data.handoffInstructions.length === 0) {
			return {
				ok: false,
				error:
					'Review verdict is "revise" but no handoff instructions were provided. Please provide at least one handoff instruction to guide the revision.',
				repairable: true,
				strategy
			};
		}
	}

	if (data.verdict === 'approved') {
		const hasHighSeverityIssues = data.blockingIssues.some((issue) => issue.severity === 'high');

		if (hasHighSeverityIssues) {
			return {
				ok: true,
				data: {
					...data,
					verdict: 'revise',
					handoffInstructions:
						data.handoffInstructions.length > 0
							? data.handoffInstructions
							: data.blockingIssues.map((issue) => issue.suggestedFix)
				},
				strategy
			};
		}
	}

	return { ok: true, data, strategy };
}

export function normalizeDraft(raw: unknown): NormalizationResult<NormalizedDraft> {
	let text = '';

	if (typeof raw === 'string') {
		text = raw;
	}

	const trimmed = stripPreamble(text.trim());

	if (trimmed.length === 0) {
		return {
			ok: false,
			error: 'Draft is empty after stripping preamble.',
			repairable: false,
			strategy: 'freeform_text'
		};
	}

	if (isLikelyRefusal(trimmed)) {
		return {
			ok: false,
			error: 'Response appears to be a refusal or a meta-response rather than a resume.',
			repairable: false,
			strategy: 'freeform_text'
		};
	}

	const canonicalJson = extractCanonicalResumeDocument(trimmed);
	const plainText = stripMarkdown(trimmed);
	const previewText = generatePreviewText(trimmed);

	if (canonicalJson.sections.length === 0) {
		return {
			ok: false,
			error: 'Draft does not contain enough recognizable resume sections.',
			repairable: true,
			strategy: 'freeform_text'
		};
	}
	return {
		ok: true,
		data: { canonicalJson, markdown: trimmed, plainText, previewText },
		strategy: 'freeform_text'
	};
}

function stripPreamble(text: string): string {
	const lines = text.split('\n');
	const firstContentLine = lines.findIndex(
		(line) =>
			line.trim().length > 0 &&
			!/^(here\s+(is|are)|sure|certainly|of course|i'?ve|below)/i.test(line.trim())
	);

	if (firstContentLine > 0 && firstContentLine <= 3) {
		return lines.slice(firstContentLine).join('\n').trim();
	}
	return text;
}

function stripMarkdown(md: string): string {
	return md
		.replace(/#{1,6}\s+/g, '')
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/\*(.+?)\*/g, '$1')
		.replace(/`(.+?)`/g, '$1')
		.replace(/^\s*[-*+]\s+/gm, '• ')
		.replace(/^\s*\d+\.\s+/gm, '')
		.replace(/\[(.+?)\]\(.+?\)/g, '$1')
		.trim();
}

function isLikelyRefusal(text: string): boolean {
	const lowered = text.toLowerCase();
	return [
		'i can’t help with that',
		'i cannot help with that',
		'i can’t provide',
		'i cannot provide',
		'as an ai',
		'i do not have enough information'
	].some((phrase) => lowered.includes(phrase));
}

function isHeading(line: string): boolean {
	if (/^#{1,6}\s+/.test(line)) return true;
	if (
		/^(summary|experience|work experience|skills|education|projects|certifications|profile|professional summary)\b/i.test(
			line
		)
	) {
		return line.length <= 60;
	}
	return false;
}

function normalizeHeading(line: string): string {
	return line
		.replace(/^#{1,6}\s+/, '')
		.replace(/:$/, '')
		.trim();
}

function extractAndParse<T>(
	raw: unknown,
	schema: z.ZodType<T>,
	strategy: OutputStrategy
): NormalizationResult<T> {
	if (raw !== null && typeof raw === 'object') {
		const result = schema.safeParse(raw);
		if (result.success) return { ok: true, data: result.data, strategy };
		return {
			ok: false,
			error: `Schema validation failed: ${result.error.message}.`,
			repairable: true,
			strategy,
			zodErrors: result.error
		};
	}

	if (typeof raw === 'string') {
		const jsonObject = extractJsonFromString(raw);

		if (jsonObject === null) {
			return {
				ok: false,
				error: 'Could not extract JSON from the text response',
				repairable: true,
				strategy
			};
		}

		const result = schema.safeParse(jsonObject);
		if (result.success) {
			return { ok: true, data: result.data, strategy };
		}

		return {
			ok: false,
			error: `Schema validation failed after extracting JSON: ${result.error.message}.`,
			repairable: true,
			zodErrors: result.error,
			strategy
		};
	}

	return {
		ok: false,
		error: `Expected an object or a string, but received ${typeof raw}.`,
		repairable: false,
		strategy
	};
}

function extractJsonFromString(raw: string): unknown | null {
	const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (fenceMatch) {
		try {
			return JSON.parse(fenceMatch[1]);
		} catch {
			// fall through
		}
	}

	const braceStart = raw.indexOf('{');
	const bracketStart = raw.indexOf('[');
	if (braceStart === -1 && bracketStart === -1) return null;

	const start =
		braceStart === -1
			? bracketStart
			: bracketStart === -1
				? braceStart
				: Math.min(braceStart, bracketStart);

	const closer = raw[start] === '{' ? '}' : ']';

	const end = raw.lastIndexOf(closer);

	if (end <= start) return null;

	try {
		return JSON.parse(raw.slice(start, end + 1));
	} catch {
		return null;
	}
}

function extractCanonicalResumeDocument(text: string): CanonicalResumeDocument {
	const lines = text.split('\n');
	const sections: CanonicalResumeSection[] = [];
	let current: CanonicalResumeSection | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		if (isHeading(line)) {
			if (current && current.lines.length > 0) sections.push(current);
			const title = normalizeHeading(line);
			current = {
				kind: classifySection(title, sections.length),
				title,
				lines: []
			};
			continue;
		}
		if (!current) {
			current = {
				kind: sections.length === 0 ? 'header' : 'other',
				title: sections.length === 0 ? 'Header' : 'Other',
				lines: []
			};
		}

		current.lines.push(line);
	}

	if (current && current.lines.length > 0) sections.push(current);

	return { schemaVersion: SCHEMA_VERSIONS.resume, sections };
}

function classifySection(title: string, index: number): CanonicalResumeSectionKind {
	const normalized = title.toLowerCase();
	if (index === 0) return 'header';
	if (normalized.includes('summary') || normalized.includes('profile')) return 'summary';
	if (normalized.includes('experience')) return 'experience';
	if (normalized.includes('skill')) return 'skills';
	if (normalized.includes('education')) return 'education';
	if (normalized.includes('project')) return 'projects';
	if (normalized.includes('certification')) return 'certifications';
	return 'other';
}

function generatePreviewText(markdown: string): string {
	const lines = markdown.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
			return trimmed.length > MESSAGE_LIMITS.preview
				? `${trimmed.slice(0, MESSAGE_LIMITS.preview - 1)}…`
				: trimmed;
		}
	}
	return markdown.slice(0, MESSAGE_LIMITS.preview);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function dedupeString(values: string[]): string[] {
	return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
