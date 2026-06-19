import type { CanonicalResumeDocument } from './compile';

/**
 * Neutral sample resume used to pre-render template thumbnails and sample files
 * (plan §2/§11.5). It is *not* a real user's data — it's generic filler chosen
 * to exercise every section a template styles (header with name/contact/links,
 * prose summary, bulleted experience, comma-flowed skills, education,
 * certifications) so a thumbnail represents the template faithfully.
 *
 * It deliberately includes markdown (`**bold**`, `[label](url)` links) so the
 * thumbnail reflects the same compile path (`compileResumeHtml`) the real
 * export uses — what you see in the grid is what the template produces.
 */
export const SAMPLE_RESUME_DOCUMENT: CanonicalResumeDocument = {
	schemaVersion: '1',
	sections: [
		{
			kind: 'header',
			title: 'Header',
			lines: [
				'**Jordan A. Rivera**',
				'San Francisco, CA · (555) 123-4567 · jordan.rivera@example.com',
				'[LinkedIn](https://linkedin.com/in/jordanrivera) · [GitHub](https://github.com/jordanrivera) · [Portfolio](https://jordanrivera.dev)'
			]
		},
		{
			kind: 'summary',
			title: 'Summary',
			lines: [
				'Senior software engineer with 8+ years building scalable web platforms and developer tooling. Proven record of leading cross-functional teams, shipping reliable systems, and mentoring engineers.'
			]
		},
		{
			kind: 'experience',
			title: 'Experience',
			lines: [
				'**Staff Engineer** — Acme Cloud (2021–Present)',
				'- Led migration of the billing platform to event-driven services, cutting p99 latency by **43%**.',
				'- Mentored 6 engineers and introduced a design-review process adopted org-wide.',
				'**Senior Engineer** — Northwind Labs (2018–2021)',
				'- Built a multi-tenant analytics pipeline processing 2B+ events/day.',
				'- Owned the on-call rotation and reduced critical incidents by 60%.'
			]
		},
		{
			kind: 'skills',
			title: 'Skills',
			lines: [
				'Languages: TypeScript, Go, Python, SQL',
				'Platforms: AWS, GCP, Kubernetes, Terraform',
				'Practices: Distributed systems, CI/CD, observability, TDD'
			]
		},
		{
			kind: 'education',
			title: 'Education',
			lines: ['B.S. Computer Science — University of Washington (2016)']
		},
		{
			kind: 'certifications',
			title: 'Certifications',
			lines: ['AWS Certified Solutions Architect — Professional (2023)']
		}
	]
};

/** The sample document as the JSON string `compileResumeHtml` expects. */
export const SAMPLE_RESUME_CANONICAL_JSON = JSON.stringify(SAMPLE_RESUME_DOCUMENT);
