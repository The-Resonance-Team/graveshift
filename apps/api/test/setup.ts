// Test-only boot config. No real secret is used anywhere in the suite.
process.env.GRAVESHIFT_OAUTH_JWT_SECRET ??= 'graveshift-test-only-secret-32chars';
process.env.GRAVESHIFT_OAUTH_CLIENTS ??= JSON.stringify({
  'client-1': {
    secret: 'test-client-secret-123456',
    tenantId: 'tenant-1',
    scopes: [
      'tokens:manage',
      'incidents:read',
      'diagnoses:read',
      'audit:read',
      'logs:read',
      'metrics:read',
      'fix:propose',
      'events:publish',
    ],
  },
  'client-2': {
    secret: 'test-client-secret-654321',
    tenantId: 'tenant-2',
    scopes: ['tokens:manage', 'incidents:read'],
  },
});
