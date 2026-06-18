// Throwaway: compile modern-ats.html with sample data so we can eyeball the
// output in a browser before uploading. Run: node templates/_sample-build.mts
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compileResumeHtml } from '../src/lib/render/compile.ts';

const here = dirname(fileURLToPath(import.meta.url));

const canonical = {
	schemaVersion: '1',
	sections: [
		{
			kind: 'header',
			title: '',
			lines: [
				'Jordan A. Rivera',
				'Senior Software Engineer',
				'jordan.rivera@example.com',
				'(555) 123-4567',
				'San Francisco, CA',
				'linkedin.com/in/jordanrivera'
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
				'Staff Engineer — Acme Cloud (2021–Present)',
				'Led migration of the billing platform to event-driven services, cutting p99 latency by 43%.',
				'Mentored 6 engineers; introduced a design-review process adopted org-wide.',
				'Senior Engineer — Northwind Labs (2018–2021)',
				'Built a multi-tenant analytics pipeline processing 2B+ events/day.',
				'Owned the on-call rotation and reduced critical incidents by 60%.'
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

const templateHtml = await readFile(join(here, 'modern-ats.html'), 'utf8');
const compiled = compileResumeHtml(templateHtml, JSON.stringify(canonical));
await writeFile(join(here, '_sample-preview.html'), compiled, 'utf8');
console.log('Wrote templates/_sample-preview.html');
