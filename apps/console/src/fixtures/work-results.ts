import type {
  AnswerBody,
  FixNowBody,
  FixResult,
  TriageBody,
  TriageResult,
  WorkCaller,
  WorkErrorCode,
} from '@graveshift/work';

import { projectScope, sampleFixture, SAMPLE_IDS } from './sample';
import { sampleWorkItems } from './work-items';

function workItem(id: string) {
  const fixture = sampleWorkItems.find((candidate) => candidate.id === id);
  if (fixture === undefined) throw new Error(`Missing sample work item: ${id}`);
  return fixture.payload;
}

const doneItem = workItem('work-done');
const donePr = doneItem.draftPr;
if (donePr === null) throw new Error('The completed sample work item needs a draft pull request');

const exorcist = { name: 'Exorcist', slug: 'exorcist' } as const;
const sreAgent = { name: 'SRE Agent', slug: 'sre-agent' } as const;

export const sampleTriageResults = [
  sampleFixture<TriageResult>('triage-human', 'api_shaped', projectScope, {
    item: workItem('work-human'),
    autoFix: null,
  }),
  sampleFixture<TriageResult>('triage-manual-agent', 'api_shaped', projectScope, {
    item: workItem('work-manual-agent'),
    autoFix: null,
  }),
  sampleFixture<TriageResult>('triage-auto-agent', 'api_shaped', projectScope, {
    item: workItem('work-auto-agent'),
    autoFix: {
      ok: true,
      effect: 'allow',
      reason: null,
      failure: 'none',
      routing: { kind: 'routed', agent: exorcist },
      attemptId: 'attempt-auto-1',
    },
  }),
] as const;

export const sampleFixResults = [
  sampleFixture<FixResult>('fix-saved-question', 'api_shaped', projectScope, {
    item: workItem('work-saved-question'),
    trigger: 'fix_now',
    effect: 'allow',
    ok: false,
    pr: null,
    reason: 'The Agent saved one question before it could continue.',
    failure: 'awaiting_answer',
    routing: {
      kind: 'ask',
      agent: sreAgent,
      questionId: 'question-environment-1',
      question: 'Which Environment should the change target?',
      missing: ['ENVIRONMENT'],
    },
    attemptId: 'attempt-question-1',
  }),
  sampleFixture<FixResult>('fix-done', 'api_shaped', projectScope, {
    item: doneItem,
    trigger: 'fix_now',
    effect: 'allow',
    ok: true,
    pr: donePr,
    reason: null,
    failure: 'none',
    routing: { kind: 'routed', agent: exorcist },
    attemptId: 'attempt-done-1',
  }),
  sampleFixture<FixResult>('fix-failed', 'api_shaped', projectScope, {
    item: workItem('work-failed'),
    trigger: 'fix_now',
    effect: 'allow',
    ok: false,
    pr: null,
    reason: 'The sample fix attempt failed before it opened a draft pull request.',
    failure: 'fix_error',
    routing: { kind: 'routed', agent: { name: 'DevOps Agent', slug: 'devops-agent' } },
    attemptId: 'attempt-failed-1',
  }),
  sampleFixture<FixResult>('fix-no-draft-pr', 'api_shaped', projectScope, {
    item: workItem('work-no-draft-pr'),
    trigger: 'auto_fix',
    effect: 'allow',
    ok: false,
    pr: null,
    reason: 'The sample publication outcome is uncertain. Check it before any retry.',
    failure: 'publication_uncertain',
    routing: { kind: 'routed', agent: exorcist },
    attemptId: 'attempt-retry-1',
  }),
  sampleFixture<FixResult>('fix-needs-human', 'api_shaped', projectScope, {
    item: workItem('work-saved-question'),
    trigger: 'fix_now',
    effect: 'require_approval',
    ok: false,
    pr: null,
    reason: 'The sample route needs a person to choose the next step.',
    failure: 'needs_human',
    routing: {
      kind: 'needs_human',
      agent: 'SRE Agent',
      reason: 'The request does not identify a safe automated route.',
      missing: ['OWNER'],
    },
    attemptId: 'attempt-human-1',
  }),
] as const;

export interface SampleWorkError {
  code: WorkErrorCode;
  status: 403 | 404 | 409 | 422;
  message: string;
}

export const sampleWorkErrors = [
  sampleFixture<SampleWorkError>('work-error-state-changed', 'api_shaped', projectScope, {
    code: 'STATE_CHANGED',
    status: 409,
    message: 'The Work item changed after it was loaded. Reload it before retrying.',
  }),
  sampleFixture<SampleWorkError>('work-error-command-conflict', 'api_shaped', projectScope, {
    code: 'COMMAND_CONFLICT',
    status: 409,
    message:
      'This command ID was used with different input. Use a new command ID for a new action.',
  }),
  sampleFixture<SampleWorkError>('work-error-manual-assignment', 'api_shaped', projectScope, {
    code: 'MANUAL_ASSIGNMENT',
    status: 403,
    message: 'This Work item is assigned to a person. Fix now is unavailable.',
  }),
  sampleFixture<SampleWorkError>('work-error-invalid-assignee', 'api_shaped', projectScope, {
    code: 'INVALID_ASSIGNEE',
    status: 422,
    message: 'Choose a person or a configured Agent.',
  }),
  sampleFixture<SampleWorkError>('work-error-unknown-agent', 'api_shaped', projectScope, {
    code: 'UNKNOWN_AGENT',
    status: 422,
    message: 'The selected Agent is unavailable.',
  }),
  sampleFixture<SampleWorkError>('work-error-project-forbidden', 'api_shaped', projectScope, {
    code: 'PROJECT_FORBIDDEN',
    status: 403,
    message: 'This Project is not available to the sample caller.',
  }),
  sampleFixture<SampleWorkError>('work-error-not-found', 'api_shaped', projectScope, {
    code: 'WORK_NOT_FOUND',
    status: 404,
    message: 'The Work item does not exist in this Project.',
  }),
] as const;

interface SampleTriageCommand {
  caller: WorkCaller;
  id: string;
  input: TriageBody;
}

interface SampleFixNowCommand {
  caller: WorkCaller;
  id: string;
  input: FixNowBody;
}

interface SampleAnswerCommand {
  caller: WorkCaller;
  id: string;
  input: AnswerBody;
}

const caller = { projectId: SAMPLE_IDS.checkoutProject, actor: SAMPLE_IDS.sampleClient } as const;

export const sampleWorkCommands = [
  sampleFixture<SampleTriageCommand>('command-triage-human', 'api_shaped', projectScope, {
    caller: { ...caller, commandId: 'cmd-triage-human', expectedVersion: 3 },
    id: 'work-human',
    input: { assignee: 'needs_human' },
  }),
  sampleFixture<SampleTriageCommand>('command-triage-agent', 'api_shaped', projectScope, {
    caller: { ...caller, commandId: 'cmd-triage-agent', expectedVersion: 3 },
    id: 'work-manual-agent',
    input: { assignee: 'needs_agent_SRE Agent' },
  }),
  sampleFixture<SampleFixNowCommand>('command-fix-now', 'api_shaped', projectScope, {
    caller: { ...caller, commandId: 'cmd-fix-now', expectedVersion: 3 },
    id: 'work-manual-agent',
    input: { note: 'Sample manual fix request.' },
  }),
  sampleFixture<SampleAnswerCommand>('command-answer', 'api_shaped', projectScope, {
    caller: { ...caller, commandId: 'cmd-answer', expectedVersion: 3 },
    id: 'work-saved-question',
    input: {
      attemptId: 'attempt-question-1',
      questionId: 'question-environment-1',
      params: { ENVIRONMENT: 'production' },
    },
  }),
] as const;
