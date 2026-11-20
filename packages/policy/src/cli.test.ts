import { expect, test } from 'bun:test';

import { main } from './cli';

const example = `${import.meta.dir}/../../../policy.example.yaml`;

test('policy check accepts the example policy', async () => {
  expect(await main(['policy', 'check', example])).toBe(0);
});

test('policy check rejects a missing file and bad usage', async () => {
  expect(await main(['policy', 'check', '/nonexistent.yaml'])).toBe(1);
  expect(await main(['nope'])).toBe(2);
});
