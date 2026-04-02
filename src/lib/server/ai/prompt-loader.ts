/**
 * Central prompt registry - single place to load md files, 
 * easy to swap content later
 * Prompt stays away from the code
 */

import systemPrompt from './prompts/system.md?raw';
import writerRolePrompt from './prompts/roles/writer.md?raw';
import reviewerRolePrompt from './prompts/roles/reviewer.md?raw';
import writerDraftWorkflow from './prompts/workflows/writer-drafts.md?raw';
import writerReviseWorkflow from './prompts/workflows/writer-revise.md?raw';
import reviewerWorkflow from './prompts/workflows/reviewer.md?raw';
import planWorkflow from './prompts/workflows/reviewer-plan.md?raw';

export const PROMPTS = {
  baseSystemPrompt: systemPrompt.trim(),
  roles: {
    writer: writerRolePrompt.trim(),
    reviewer: reviewerRolePrompt.trim()
  },
  workflows: {
    reviewerPlan: planWorkflow.trim(),
    writerDraft: writerDraftWorkflow.trim(),
    writerRevise: writerReviseWorkflow.trim(),
    reviewerReview: reviewerWorkflow.trim(),
  }
} as const;