import { describe, expect, test } from 'bun:test';
import { PACKAGE_NAME } from './index';

describe('daemon', () => {
  test('PACKAGE_NAME is @graveshift/daemon', () => {
    expect(PACKAGE_NAME).toBe('@graveshift/daemon');
  });
});
