import type { WorkRouting } from '@graveshift/work';

import { projectScope, sampleFixture } from './sample';

export const sampleWorkRoutings = [
  sampleFixture<WorkRouting>('routing-none', 'api_shaped', projectScope, { routing: null }),
  sampleFixture<WorkRouting>('routing-manual-running', 'api_shaped', projectScope, {
    routing: {
      attemptId: 'attempt-manual-1',
      questionId: null,
      question: null,
      missing: [],
      agent: 'SRE Agent',
      trigger: 'fix_now',
      state: 'running',
    },
  }),
  sampleFixture<WorkRouting>('routing-auto-running', 'api_shaped', projectScope, {
    routing: {
      attemptId: 'attempt-auto-1',
      questionId: null,
      question: null,
      missing: [],
      agent: 'Exorcist',
      trigger: 'auto_fix',
      state: 'running',
    },
  }),
  sampleFixture<WorkRouting>('routing-saved-question', 'api_shaped', projectScope, {
    routing: {
      attemptId: 'attempt-question-1',
      questionId: 'question-environment-1',
      question: 'Which Environment should the change target?',
      missing: ['ENVIRONMENT'],
      agent: 'SRE Agent',
      trigger: 'fix_now',
      state: 'awaiting_answer',
    },
  }),
  sampleFixture<WorkRouting>('routing-publication-uncertain', 'api_shaped', projectScope, {
    routing: {
      attemptId: 'attempt-retry-1',
      questionId: null,
      question: null,
      missing: [],
      agent: 'Exorcist',
      trigger: 'auto_fix',
      state: 'uncertain',
    },
  }),
] as const;
