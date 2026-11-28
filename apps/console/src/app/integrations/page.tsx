'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
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

import { plannedIntegrations, type PlannedIntegration } from '../../fixtures/integrations';
import { PLANNED_DEMO_NOTICE } from '../../fixtures/sample';

type IntegrationCategory = PlannedIntegration['category'];
type IntegrationStatus = PlannedIntegration['status'];

interface IntegrationRow extends Record<string, unknown> {
  id: string;
  name: string;
  model: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  credential: string;
  lastChecked: string;
}

const categoryLabel: Record<IntegrationCategory, string> = {
  event_source: 'Event source',
  source_control: 'Source control',
  notification: 'Notifications',
};

const statusLabel: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  disconnected: 'Not connected',
  attention_required: 'Needs attention',
};

const statusVariant: Record<IntegrationStatus, 'success' | 'neutral' | 'warning'> = {
  connected: 'success',
  disconnected: 'neutral',
  attention_required: 'warning',
};

const categoryOptions = [
  { value: 'event_source', label: 'Event source' },
  { value: 'source_control', label: 'Source control' },
  { value: 'notification', label: 'Notifications' },
];

const statusOptions = [
  { value: 'connected', label: 'Connected' },
  { value: 'disconnected', label: 'Not connected' },
  { value: 'attention_required', label: 'Needs attention' },
];

const timestampFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const rows: IntegrationRow[] = plannedIntegrations.map(({ payload }) => ({
  id: payload.id,
  name: payload.name,
  model: 'Planned model',
  category: payload.category,
  status: payload.status,
  credential: payload.credentialId === null ? 'No credential linked' : 'Credential metadata linked',
  lastChecked:
    payload.lastCheckedAt === null
      ? 'Not checked'
      : timestampFormat.format(new Date(payload.lastCheckedAt)),
}));

const columns: TableColumn<IntegrationRow>[] = [
  { key: 'name', header: 'Integration', width: proportional(1, { minWidth: 160 }) },
  {
    key: 'model',
    header: 'Model',
    width: proportional(1, { minWidth: 120 }),
    renderCell: (row) => <Badge label={row.model} variant="purple" />,
  },
  {
    key: 'category',
    header: 'Category',
    width: proportional(1, { minWidth: 120 }),
    renderCell: (row) => <Text>{categoryLabel[row.category]}</Text>,
  },
  {
    key: 'status',
    header: 'State',
    width: proportional(1, { minWidth: 120 }),
    renderCell: (row) => (
      <Badge label={statusLabel[row.status]} variant={statusVariant[row.status]} />
    ),
  },
  { key: 'credential', header: 'Credential', width: proportional(1, { minWidth: 140 }) },
  { key: 'lastChecked', header: 'Last checked', width: proportional(1, { minWidth: 140 }) },
];

export default function IntegrationsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (needle === '' ||
          Object.values(row).some((value) => String(value).toLowerCase().includes(needle))) &&
        (category === null || row.category === category) &&
        (status === null || row.status === status),
    );
  }, [query, category, status]);

  const hasFilters = query !== '' || category !== null || status !== null;
  const clearAll = useCallback(() => {
    setQuery('');
    setCategory(null);
    setStatus(null);
  }, []);

  return (
    <Layout height="fill" padding={0}>
      <LayoutHeader hasDivider label="Integration filters and table actions">
        <Section variant="transparent" padding={4}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Text type="label" color="secondary">
                    MANAGE
                  </Text>
                  <Heading level={1}>Integrations</Heading>
                </VStack>
              </StackItem>
              <Badge label="Planned model" variant="purple" />
            </HStack>
            <Text type="supporting" color="secondary">
              {PLANNED_DEMO_NOTICE} No integration is connected and no connection action is
              available.
            </Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <TextInput
                label="Search integrations"
                isLabelHidden
                placeholder="Search integrations"
                size="sm"
                width={220}
                value={query}
                onChange={setQuery}
                startIcon="search"
                hasClear
              />
              <Selector
                label="Category"
                options={categoryOptions}
                value={category}
                onChange={setCategory}
                hasClear
                isLabelHidden
                size="sm"
                placeholder="Category"
              />
              <Selector
                label="State"
                options={statusOptions}
                value={status}
                onChange={setStatus}
                hasClear
                isLabelHidden
                size="sm"
                placeholder="State"
              />
              <Text type="supporting" color="secondary">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </Text>
              {hasFilters && (
                <Link type="supporting" onClick={clearAll}>
                  Clear all
                </Link>
              )}
              <Link href="/credentials" type="supporting">
                View credential metadata
              </Link>
            </HStack>
          </VStack>
        </Section>
      </LayoutHeader>
      <LayoutContent role="main" padding={4} label="Integrations">
        {filtered.length === 0 ? (
          <EmptyState
            title="No integrations match these filters"
            description="Clear the search or a filter to see the planned models."
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
