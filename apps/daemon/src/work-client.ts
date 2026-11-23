import { WORK_STATE_RESPONSES, workPath, type WorkRuntime } from '@graveshift/work';

import type { PrivateApi } from './api-client';

export function createWorkClient(api: PrivateApi): WorkRuntime {
  return {
    read: (ref) =>
      api.post(workPath(ref.id, 'read'), { projectId: ref.projectId }, WORK_STATE_RESPONSES.read),
    replay: (caller, id, request) =>
      api.post(workPath(id, 'replay'), { caller, request }, WORK_STATE_RESPONSES.replay),
    saveTriage: (caller, id, input) =>
      api.post(workPath(id, 'save-triage'), { caller, input }, WORK_STATE_RESPONSES['save-triage']),
    claim: (caller, id, input) =>
      api.post(workPath(id, 'claim'), { caller, input }, WORK_STATE_RESPONSES.claim),
    saveQuestion: (caller, id, input) =>
      api.post(
        workPath(id, 'save-question'),
        { caller, input },
        WORK_STATE_RESPONSES['save-question'],
      ),
    applyAnswer: (caller, id, input) =>
      api.post(
        workPath(id, 'apply-answer'),
        { caller, input },
        WORK_STATE_RESPONSES['apply-answer'],
      ),
    beginPublication: (caller, id, input) =>
      api.post(
        workPath(id, 'begin-publication'),
        { caller, input },
        WORK_STATE_RESPONSES['begin-publication'],
      ),
    recordPublication: (caller, id, input) =>
      api.post(
        workPath(id, 'record-publication'),
        { caller, input },
        WORK_STATE_RESPONSES['record-publication'],
      ),
    finish: (caller, id, input) =>
      api.post(workPath(id, 'finish'), { caller, input }, WORK_STATE_RESPONSES.finish),
    heartbeat: (caller, id, input) =>
      api.post(workPath(id, 'heartbeat'), { caller, input }, WORK_STATE_RESPONSES.heartbeat),
    abandon: (caller, id, input) =>
      api.post(workPath(id, 'abandon'), { caller, input }, WORK_STATE_RESPONSES.abandon),
    abortPublication: (caller, id, input) =>
      api.post(
        workPath(id, 'abort-publication'),
        { caller, input },
        WORK_STATE_RESPONSES['abort-publication'],
      ),
  };
}
