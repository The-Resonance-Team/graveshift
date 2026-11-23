import { expect, test } from 'bun:test';

import { admissionErrorCode } from './startup-error';

test('a startup failure log carries only the error code', () => {
  const secretPath = '/data/graveshift-actuator/private-secret.db';
  expect(
    admissionErrorCode(
      Object.assign(new Error('open failed'), { code: 'EACCES', path: secretPath }),
    ),
  ).toBe('EACCES');
  expect(admissionErrorCode({ code: 'ENOENT', path: secretPath })).toBe('ENOENT');
  expect(admissionErrorCode(new Error(`cannot open ${secretPath}`))).toBe('UNKNOWN');
  expect(admissionErrorCode(null)).toBe('UNKNOWN');
});
