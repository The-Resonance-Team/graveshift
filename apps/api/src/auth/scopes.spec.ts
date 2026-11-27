import { describe, expect, test } from 'bun:test';

import { expandScopes } from './scopes';

describe('expandScopes', () => {
  test('an alias normalizes to its canonical scope', () => {
    expect(expandScopes(['audit:read'])).toEqual(['audit:read', 'org:read']);
    expect(expandScopes(['logs:read'])).toEqual(['logs:read', 'event:read']);
    expect(expandScopes(['incidents:read'])).toEqual(['incidents:read', 'project:read']);
  });

  test('a canonical scope does not expand into its aliases', () => {
    const granted = expandScopes(['org:read', 'event:read', 'project:read']);
    expect(granted).not.toContain('audit:read');
    expect(granted).not.toContain('logs:read');
    expect(granted).not.toContain('events:publish');
    expect(granted).not.toContain('incidents:read');
    expect(granted).not.toContain('diagnoses:read');
    expect(granted).not.toContain('metrics:read');
  });

  test('an alias does not widen access to a sibling alias', () => {
    expect(expandScopes(['logs:read'])).not.toContain('events:publish');
    expect(expandScopes(['audit:read'])).not.toContain('org:ci');
  });
});
