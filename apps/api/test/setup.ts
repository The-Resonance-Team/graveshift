// Test-only boot config. No real secret is used anywhere in the suite.
process.env.GRAVESHIFT_OAUTH_JWT_SECRET ??= 'graveshift-test-only-secret-32chars';
// Test-only placeholder for the deployment-local daemon read token. No real secret.
process.env.GRAVESHIFT_DAEMON_READ_TOKEN ??= 'test-only-daemon-read-token';
process.env.DATABASE_URL ??= 'postgresql://local_test:local_test@127.0.0.1:5436/graveshift_test';
process.env.GRAVESHIFT_PROJECT_ID ??= '12345';
process.env.GRAVESHIFT_API_INTERNAL_TOKEN ??= 'graveshift-test-api-internal-only-32chars';
process.env.GRAVESHIFT_DAEMON_INTERNAL_TOKEN ??= 'graveshift-test-daemon-internal-32chars';
process.env.GRAVESHIFT_OAUTH_CLIENTS ??= JSON.stringify({
  'client-1': {
    secret: 'test-client-secret-123456',
    projectId: '12345',
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
    projectId: 'project-2',
    scopes: ['tokens:manage', 'incidents:read', 'events:publish'],
  },
  // Test-only client for the one config endpoint. Test-only placeholder, no real secret.
  'client-config-export': {
    secret: 'test-client-secret-config-export',
    projectId: '12345',
    scopes: ['config:export'],
  },
  'client-no-config': {
    secret: 'test-client-secret-no-config',
    projectId: '12345',
    scopes: ['incidents:read'],
  },
});
