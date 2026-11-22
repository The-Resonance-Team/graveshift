import { describe, expect, test } from 'bun:test';

import { AuditCountersUnavailable } from './audit.errors';
import { parsePolicyUsage } from './audit.usage';

const empty = {
  actionsLast10Min: 0n,
  diagnosisLoops: 0n,
  modelCalls: 0n,
  unknownCosts: 0n,
  spentUsd: null,
};

describe('policy usage aggregate validation', () => {
  test('an empty model day has an explicit zero cost', () => {
    expect(parsePolicyUsage([empty])).toEqual({
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    });
  });

  test('returns safe counts and a numeric recorded total', () => {
    expect(
      parsePolicyUsage([
        {
          ...empty,
          actionsLast10Min: 3n,
          diagnosisLoops: 4n,
          modelCalls: 2n,
          spentUsd: '0.300',
        },
      ]),
    ).toEqual({ actionsLast10Min: 3, diagnosisLoops: 4, llmSpentTodayUsd: 0.3 });
  });

  test.each(
    [
      [],
      [empty, empty],
      [{ ...empty, unknownCosts: 1n }],
      [{ ...empty, modelCalls: 1n }],
      [{ ...empty, spentUsd: '0' }],
      [{ ...empty, actionsLast10Min: 1 }],
      [{ ...empty, actionsLast10Min: -1n }],
      [{ ...empty, diagnosisLoops: BigInt(Number.MAX_SAFE_INTEGER) + 1n }],
      [{ ...empty, modelCalls: 1n, spentUsd: '-1' }],
      [{ ...empty, modelCalls: 1n, spentUsd: 'NaN' }],
      [{ ...empty, modelCalls: 1n, spentUsd: '9'.repeat(400) }],
      [{ ...empty, modelCalls: 1n, spentUsd: '' }],
    ].map((input) => ({ input })),
  )('fails closed on an invalid or unrepresentable aggregate: %j', ({ input }) => {
    expect(() => parsePolicyUsage(input)).toThrow(AuditCountersUnavailable);
  });
});
