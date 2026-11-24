import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { DEFAULT_PORT, parsePort } from './config';

describe('PORT validation', () => {
  test('missing PORT uses the default', async () => {
    expect(await Effect.runPromise(parsePort(undefined))).toBe(DEFAULT_PORT);
  });

  test('a valid PORT is accepted', async () => {
    expect(await Effect.runPromise(parsePort('2603'))).toBe(2603);
  });

  test('invalid values fail with InvalidPort', async () => {
    const values = ['', 'abc', '99999', '0', '2602.5'];
    const errors = await Promise.all(
      values.map((value) => Effect.runPromise(Effect.flip(parsePort(value)))),
    );
    for (const error of errors) expect(error._tag).toBe('InvalidPort');
  });
});
