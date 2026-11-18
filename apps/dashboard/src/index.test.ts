import { describe, expect, test } from 'bun:test';
import { PACKAGE_NAME } from './index';

describe('dashboard', () => {
  test('PACKAGE_NAME is @graveshift/dashboard', () => {
    expect(PACKAGE_NAME).toBe('@graveshift/dashboard');
  });
});
