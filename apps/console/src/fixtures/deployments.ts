import {
  projectScope,
  sampleFixture,
  SAMPLE_IDS,
  SAMPLE_TIMESTAMPS,
  sandboxProjectScope,
} from './sample';

export interface SampleDeployment {
  projectId: string;
  deploymentId: string;
  environment: string;
  title: string;
  dateStarted: string;
  dateFinished: string | null;
  url: string | null;
  closedAt: string | null;
  createdAt: string;
}

export const sampleDeployments = [
  sampleFixture<SampleDeployment>('deployment-checkout-production', 'api_shaped', projectScope, {
    projectId: SAMPLE_IDS.checkoutProject,
    deploymentId: '0123456789abcdef0123456789abcdef01234567',
    environment: 'production',
    title: 'Sample checkout release',
    dateStarted: SAMPLE_TIMESTAMPS.earlier,
    dateFinished: SAMPLE_TIMESTAMPS.anchor,
    url: 'https://example.com/sample-deployments/checkout-production',
    closedAt: null,
    createdAt: SAMPLE_TIMESTAMPS.earlier,
  }),
  sampleFixture<SampleDeployment>('deployment-checkout-running', 'api_shaped', projectScope, {
    projectId: SAMPLE_IDS.checkoutProject,
    deploymentId: '89abcdef0123456789abcdef0123456789abcdef',
    environment: 'production',
    title: 'Sample checkout candidate',
    dateStarted: SAMPLE_TIMESTAMPS.later,
    dateFinished: null,
    url: null,
    closedAt: null,
    createdAt: SAMPLE_TIMESTAMPS.later,
  }),
  sampleFixture<SampleDeployment>('deployment-sandbox', 'api_shaped', sandboxProjectScope, {
    projectId: SAMPLE_IDS.sandboxProject,
    deploymentId: 'fedcba9876543210fedcba9876543210fedcba98',
    environment: 'sandbox',
    title: 'Sample sandbox deployment',
    dateStarted: SAMPLE_TIMESTAMPS.earlier,
    dateFinished: SAMPLE_TIMESTAMPS.anchor,
    url: 'https://example.com/sample-deployments/sandbox',
    closedAt: null,
    createdAt: SAMPLE_TIMESTAMPS.earlier,
  }),
] as const;
