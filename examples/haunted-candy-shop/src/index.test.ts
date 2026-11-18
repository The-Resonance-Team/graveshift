import { describe, expect, test } from 'bun:test';
import { PACKAGE_NAME } from './index';

describe('haunted-candy-shop', () => {
  test('PACKAGE_NAME is @graveshift/haunted-candy-shop', () => {
    expect(PACKAGE_NAME).toBe('@graveshift/haunted-candy-shop');
  });
});
