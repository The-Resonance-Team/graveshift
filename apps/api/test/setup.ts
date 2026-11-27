// Test-only boot config. No real secret is used anywhere in the suite.
process.env.GRAVESHIFT_OAUTH_JWT_SECRET ??= 'graveshift-test-only-secret-32chars';
process.env.DATABASE_URL ??= 'postgresql://local_test:local_test@127.0.0.1:5436/graveshift_test';
process.env.GRAVESHIFT_API_INTERNAL_TOKEN ??= 'graveshift-test-api-internal-only-32chars';
process.env.GRAVESHIFT_DAEMON_INTERNAL_TOKEN ??= 'graveshift-test-daemon-internal-32chars';
