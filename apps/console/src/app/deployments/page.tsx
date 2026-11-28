'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Code } from '@astryxdesign/core/Code';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';

import { sampleDeployments, type SampleDeployment } from '../../fixtures/deployments';
import { SAMPLE_IDS, SAMPLE_NOTICE } from '../../fixtures/sample';

type DeploymentStatus = 'Running' | 'Completed' | 'Closed';

interface DeploymentRow extends Record<string, unknown> {
  id: string;
  deploymentId: string;
  commitTitle: string;
  environment: string;
  status: DeploymentStatus;
  started: string;
  finished: string;
}

const statusVariant: Record<DeploymentStatus, 'info' | 'success' | 'neutral'> = {
  Running: 'info',
  Completed: 'success',
  Closed: 'neutral',
};

const environmentOptions = [
  { value: 'production', label: 'Production' },
  { value: 'sandbox', label: 'Sandbox' },
];

const statusOptions = [
  { value: 'Running', label: 'Running' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Closed', label: 'Closed' },
];

const timestampFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function formatTimestamp(timestamp: string | null): string {
  return timestamp === null ? '—' : timestampFormat.format(new Date(timestamp));
}

function deploymentStatus(deployment: SampleDeployment): DeploymentStatus {
  if (deployment.closedAt !== null) return 'Closed';
  if (deployment.dateFinished === null) return 'Running';
  return 'Completed';
}

const rows: DeploymentRow[] = sampleDeployments
  .filter(({ payload }) => payload.projectId === SAMPLE_IDS.checkoutProject)
  .map(({ payload }) => ({
    id: payload.deploymentId,
    deploymentId: payload.deploymentId,
    commitTitle: payload.title,
    environment: payload.environment,
    status: deploymentStatus(payload),
    started: formatTimestamp(payload.dateStarted),
    finished: formatTimestamp(payload.dateFinished),
  }));

const columns: TableColumn<DeploymentRow>[] = [
  {
    key: 'deploymentId',
    header: 'Deployment ID',
    width: proportional(1, { minWidth: 160 }),
    renderCell: (row) => <Code size="inherit">{`${row.deploymentId.slice(0, 12)}…`}</Code>,
  },
  { key: 'commitTitle', header: 'Commit title', width: proportional(1, { minWidth: 150 }) },
  { key: 'environment', header: 'Environment', width: proportional(1, { minWidth: 120 }) },
  {
    key: 'status',
    header: 'Status',
    width: proportional(1, { minWidth: 110 }),
    renderCell: (row) => <Badge label={row.status} variant={statusVariant[row.status]} />,
  },
  { key: 'started', header: 'Started', width: proportional(1, { minWidth: 140 }) },
  { key: 'finished', header: 'Finished', width: proportional(1, { minWidth: 140 }) },
];

export default function DeploymentsPage() {
  const [query, setQuery] = useState('');
  const [environment, setEnvironment] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (needle === '' ||
          Object.values(row).some((value) => String(value).toLowerCase().includes(needle))) &&
        (environment === null || row.environment === environment) &&
        (status === null || row.status === status),
    );
  }, [query, environment, status]);

  const hasFilters = query !== '' || environment !== null || status !== null;
  const clearAll = useCallback(() => {
    setQuery('');
    setEnvironment(null);
    setStatus(null);
  }, []);

  return (
    <Layout height="fill" padding={0}>
      <LayoutHeader hasDivider label="Deployment filters and table actions">
        <Section variant="transparent" padding={4}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Text type="label" color="secondary">
                    GENERAL
                  </Text>
                  <Heading level={1}>Deployments</Heading>
                </VStack>
              </StackItem>
              <Badge label="Sample data" variant="neutral" />
            </HStack>
            <Text type="supporting" color="secondary">
              {SAMPLE_NOTICE} The deployment ID names the record; the commit title is read from git
              at the deployed commit.
            </Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <TextInput
                label="Search deployments"
                isLabelHidden
                placeholder="Search deployments"
                size="sm"
                width={220}
                value={query}
                onChange={setQuery}
                startIcon="search"
                hasClear
              />
              <Selector
                label="Environment"
                options={environmentOptions}
                value={environment}
                onChange={setEnvironment}
                hasClear
                isLabelHidden
                size="sm"
                placeholder="Environment"
              />
              <Selector
                label="Status"
                options={statusOptions}
                value={status}
                onChange={setStatus}
                hasClear
                isLabelHidden
                size="sm"
                placeholder="Status"
              />
              <Text type="supporting" color="secondary">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </Text>
              {hasFilters && (
                <Link type="supporting" onClick={clearAll}>
                  Clear all
                </Link>
              )}
            </HStack>
          </VStack>
        </Section>
      </LayoutHeader>
      <LayoutContent role="main" padding={4} label="Deployments">
        {filtered.length === 0 ? (
          <EmptyState
            title="No deployments match these filters"
            description="Clear the search or a filter to see the sample records."
          />
        ) : (
          <Table
            data={filtered}
            columns={columns}
            idKey="id"
            density="compact"
            dividers="rows"
            hasHover
            textOverflow="wrap"
            verticalAlign="top"
            rowCount={rows.length}
            emptyState={false}
          />
        )}
      </LayoutContent>
    </Layout>
  );
}
