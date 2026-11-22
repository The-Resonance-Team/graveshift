import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { action, approval, diagnosis, incidentAt } from './fixtures';
import {
  ActionProposalSchema,
  ApprovalSchema,
  AuditEntrySchema,
  DiagnosisSchema,
  IncidentSchema,
} from './schemas';

describe('schemas', () => {
  test('accept valid fixtures', () => {
    IncidentSchema.parse(incidentAt('diagnosed', diagnosis));
    DiagnosisSchema.parse(diagnosis);
    ActionProposalSchema.parse(action);
    ApprovalSchema.parse(approval);
    AuditEntrySchema.parse({
      seq: 1,
      at: incidentAt('open').openedAt,
      actor: 'wraith',
      type: 'signal.observed',
      payload: {},
      prevHash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    });
  });

  test('reject malformed input', () => {
    expect(DiagnosisSchema.safeParse({ ...diagnosis, evidence: [] }).success).toBe(false);
    expect(ActionProposalSchema.safeParse({ ...action, kind: 'scale' }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...approval, decidedAt: 'yesterday' }).success).toBe(false);
  });

  test('property: diagnosis confidence is accepted iff within [0, 1]', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (confidence) => {
        expect(DiagnosisSchema.safeParse({ ...diagnosis, confidence }).success).toBe(
          confidence >= 0 && confidence <= 1,
        );
      }),
    );
  });
});
