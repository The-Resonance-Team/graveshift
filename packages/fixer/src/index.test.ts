import { describe, expect, test } from 'bun:test';

import { PACKAGE_NAME } from './index';

describe('PACKAGE_NAME', () => {
  test('equals the package name', () => {
    expect(PACKAGE_NAME).toBe('@graveshift/fixer');
  });
});
