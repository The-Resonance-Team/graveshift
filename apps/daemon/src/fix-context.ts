import { DiagnosisSchema, type Diagnosis, type Incident } from '@graveshift/core';
import { RecordedHauntingSchema, type HauntingCategory } from '@graveshift/core/recorded';
import {
  SharedPolicyContextSchema,
  type SharedPolicyContext,
} from '@graveshift/core/policy-context';
import type { RepoPolicy } from '@graveshift/fixer';
import type { Policy } from '@graveshift/policy';
import type { WorkCaller, WorkSnapshot } from '@graveshift/work';

import type { PrivateApi } from './api-client';

export interface FixContext {
  diagnosis: Diagnosis;
  incident: Incident;
  category: HauntingCategory;
  /** The deployed commit SHA inherited from the Event that opened the Haunting. */
  deploymentId: string;
  repo: RepoPolicy;
  policy: SharedPolicyContext;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;

export type ResolveContext = (caller: WorkCaller, snapshot: WorkSnapshot) => Promise<FixContext>;

export class ContextFailure extends Error {
  readonly failure: 'invalid_context' | 'context_unavailable';
  constructor(failure: 'invalid_context' | 'context_unavailable') {
    super(failure);
    this.failure = failure;
  }
}

export function contextClient(api: PrivateApi, policy: Policy, envMode?: string): ResolveContext {
  return async (caller, snapshot) => {
    const checked = DiagnosisSchema.safeParse(snapshot.diagnosis);
    if (!checked.success || checked.data.id !== snapshot.item.diagnosisRef) {
      throw new ContextFailure('invalid_context');
    }
    const diagnosis = checked.data;
    const repos = policy.github.repos.filter((repo) =>
      repo.services.includes(snapshot.item.service),
    );
    const repo = repos[0];
    if (repos.length !== 1 || repo === undefined) throw new ContextFailure('invalid_context');
    const ref = {
      projectId: caller.projectId,
      service: snapshot.item.service,
      diagnosisRef: diagnosis.id,
    };
    try {
      const view = await api.post('/internal/hauntings/context', ref, RecordedHauntingSchema);
      const facts = await api.post('/internal/context', ref, SharedPolicyContextSchema);
      if (
        view.category === undefined ||
        view.incident.id !== diagnosis.incidentId ||
        view.incident.service !== snapshot.item.service ||
        view.incident.diagnosis?.id !== diagnosis.id ||
        JSON.stringify(view.incident.diagnosis) !== JSON.stringify(diagnosis) ||
        facts.service !== view.incident.service ||
        facts.confidence !== diagnosis.confidence ||
        facts.category !== view.category ||
        view.detections.some((entry) => entry.projectId !== caller.projectId) ||
        new Set(facts.signals).size !== new Set(view.detections.map((entry) => entry.rule)).size ||
        view.detections.some((entry) => !facts.signals.includes(entry.rule)) ||
        view.deploymentId === null ||
        view.deploymentId === undefined ||
        !COMMIT_SHA.test(view.deploymentId)
      ) {
        throw new ContextFailure('invalid_context');
      }
      const mode = envMode ?? facts.envMode;
      return {
        diagnosis,
        incident: view.incident,
        category: view.category,
        deploymentId: view.deploymentId,
        repo,
        policy: {
          ...facts,
          ...(mode === undefined ? {} : { envMode: mode }),
        },
      };
    } catch (error) {
      if (error instanceof ContextFailure) throw error;
      throw new ContextFailure('context_unavailable');
    }
  };
}
