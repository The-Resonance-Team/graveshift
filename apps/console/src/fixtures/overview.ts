import { projectScope, sampleFixture, SAMPLE_TIMESTAMPS } from './sample';

export interface SampleOverview {
  projectId: string;
  generatedAt: string;
  workItems: { total: number; open: number; done: number };
  deployments: { total: number; active: number };
  credentials: { total: number; active: number };
}

export const sampleOverview = sampleFixture<SampleOverview>(
  'overview-sample',
  'view_model',
  projectScope,
  {
    projectId: projectScope.projectId,
    generatedAt: SAMPLE_TIMESTAMPS.anchor,
    workItems: { total: 7, open: 6, done: 1 },
    deployments: { total: 2, active: 1 },
    credentials: { total: 4, active: 2 },
  },
);

export const emptyOverview = sampleFixture<SampleOverview>(
  'overview-empty',
  'view_model',
  projectScope,
  {
    projectId: projectScope.projectId,
    generatedAt: SAMPLE_TIMESTAMPS.anchor,
    workItems: { total: 0, open: 0, done: 0 },
    deployments: { total: 0, active: 0 },
    credentials: { total: 0, active: 0 },
  },
);
