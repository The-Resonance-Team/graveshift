'use client';

import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { Token } from '@astryxdesign/core/Token';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { useMemo } from 'react';

import { SAMPLE_NOTICE } from '../../fixtures/sample';
import { sampleOverview } from '../../fixtures/overview';
import { sampleWorkItems } from '../../fixtures/work-items';

// Content frame adapted from the Astryx `dashboard-alert-rail` page template:
// pinned page header, a KPI tile grid over the main column, and a triage rail
// that folds into the column below 1024px. All values come from sample fixtures.
const summary = sampleOverview.payload;

const KPI_COLUMNS = { minWidth: 200, max: 4, repeat: 'fit' } as const;

const attentionIds = new Set(['work-human', 'work-saved-question', 'work-failed']);
const attention = sampleWorkItems
  .filter(({ payload }) => attentionIds.has(payload.id))
  .map(({ payload }) => payload);

const statusLabel: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

const priorityColor = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'green',
} as const;

const tiles = [
  {
    label: 'Open work items',
    value: summary.workItems.open,
    detail: `${summary.workItems.done} of ${summary.workItems.total} done`,
    variant: 'warning',
    variantLabel: 'Open',
  },
  {
    label: 'Deployments',
    value: summary.deployments.total,
    detail: `${summary.deployments.active} active`,
    variant: 'success',
    variantLabel: 'Active',
  },
  {
    label: 'Credentials',
    value: summary.credentials.total,
    detail: `${summary.credentials.active} active`,
    variant: 'accent',
    variantLabel: 'Metadata',
  },
  {
    label: 'Needs attention',
    value: attention.length,
    detail: 'Sample items awaiting review',
    variant: 'error',
    variantLabel: 'Review',
  },
] as const;

const CONTEXT_BADGE = <Badge label="Sample data" variant="neutral" />;
const WORK_TOKEN = <Token size="sm" color="orange" label="Open" />;
const DEPLOY_TOKEN = <Token size="sm" color="green" label="Active" />;
const CREDENTIAL_TOKEN = <Token size="sm" color="gray" label="Metadata" />;
const INTEGRATIONS_BUTTON = (
  <Button label="View integrations" href="/integrations" size="sm" variant="secondary" />
);
const SAMPLE_BADGE = <Badge label="Sample data" variant="neutral" />;
const WORK_ITEMS_BUTTON = (
  <Button label="View work items" href="/work-items" size="sm" variant="secondary" />
);
const UPDATED_AT = (
  <Timestamp value={summary.generatedAt} format="date_time" type="inherit" color="inherit" />
);
const ATTENTION_BADGE = <Badge label={`${attention.length} sample items`} variant="warning" />;

function KpiTile({ tile }: { tile: (typeof tiles)[number] }) {
  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <StatusDot variant={tile.variant} label={tile.variantLabel} />
          <Text type="label" color="secondary">
            {tile.label}
          </Text>
        </HStack>
        <Heading level={2}>{tile.value}</Heading>
        <Text type="supporting" color="secondary">
          {tile.detail}
        </Text>
      </VStack>
    </Card>
  );
}

type AttentionItem = (typeof attention)[number];

function AttentionRow({ item }: { item: AttentionItem }) {
  const color = priorityColor[item.priority as keyof typeof priorityColor] ?? 'gray';
  const badge = useMemo(
    () => <Token size="sm" color={color} label={item.priority} />,
    [color, item.priority],
  );

  return (
    <ListItem
      label={item.title}
      description={`${statusLabel[item.status] ?? item.status}, ${item.priority} priority, ${item.service}`}
      href={`/work-items/${item.id}`}
      endContent={badge}
    />
  );
}

function AttentionList() {
  return (
    <List density="compact" hasDividers>
      {attention.map((item) => (
        <AttentionRow key={item.id} item={item} />
      ))}
    </List>
  );
}

function ContextRail() {
  return (
    <VStack gap={0}>
      <VStack gap={1} padding={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Heading level={3}>Workspace context</Heading>
          </StackItem>
          {CONTEXT_BADGE}
        </HStack>
        <Text type="supporting" color="secondary">
          Sample Project, Checkout API
        </Text>
      </VStack>
      <Divider />
      <List density="compact" hasDividers>
        <ListItem
          label="Work items"
          description={`${summary.workItems.open} open of ${summary.workItems.total}`}
          endContent={WORK_TOKEN}
        />
        <ListItem
          label="Deployments"
          description={`${summary.deployments.active} active of ${summary.deployments.total}`}
          endContent={DEPLOY_TOKEN}
        />
        <ListItem
          label="Credentials"
          description={`${summary.credentials.active} active of ${summary.credentials.total}`}
          endContent={CREDENTIAL_TOKEN}
        />
      </List>
      <Divider />
      <VStack gap={2} padding={4}>
        <Heading level={4}>Get started</Heading>
        <Text type="supporting" color="secondary">
          Connect a source, send your first event, and review your first work item. Sample only.
        </Text>
        {INTEGRATIONS_BUTTON}
      </VStack>
    </VStack>
  );
}

export default function OverviewPage() {
  const isNarrow = useMediaQuery('(max-width: 1023px)');

  const header = useMemo(
    () => (
      <LayoutHeader padding={6} hasDivider>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <VStack gap={0}>
            <Text type="label" color="secondary">
              GENERAL, OVERVIEW
            </Text>
            <Heading level={1}>Overview</Heading>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <StatusDot variant="success" label="Sample" />
              <Text type="supporting" color="secondary">
                Static sample snapshot from {UPDATED_AT}
              </Text>
            </HStack>
          </VStack>
          <HStack gap={2} vAlign="center" wrap="wrap">
            {SAMPLE_BADGE}
            {WORK_ITEMS_BUTTON}
          </HStack>
        </HStack>
      </LayoutHeader>
    ),
    [],
  );

  const foldedRail = useMemo(
    () =>
      isNarrow ? (
        <Card padding={0}>
          <ContextRail />
        </Card>
      ) : null,
    [isNarrow],
  );

  const content = useMemo(
    () => (
      <LayoutContent role="main" padding={6} label="Overview">
        <VStack gap={6}>
          <Banner
            status="info"
            title="You are viewing sample data"
            description={SAMPLE_NOTICE}
            container="section"
          />
          <Grid columns={KPI_COLUMNS} gap={3}>
            {tiles.map((tile) => (
              <KpiTile key={tile.label} tile={tile} />
            ))}
          </Grid>
          <Divider />
          <Card padding={0}>
            <VStack gap={0}>
              <VStack gap={1} padding={4}>
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill">
                    <Heading level={2}>Needs attention</Heading>
                  </StackItem>
                  {ATTENTION_BADGE}
                </HStack>
                <Text type="supporting" color="secondary">
                  Sample work items awaiting review. No live check was run.
                </Text>
              </VStack>
              <Divider />
              <AttentionList />
            </VStack>
          </Card>
          {foldedRail}
        </VStack>
      </LayoutContent>
    ),
    [foldedRail],
  );

  const rail = useMemo(
    () =>
      isNarrow ? undefined : (
        <LayoutPanel
          width={360}
          padding={0}
          hasDivider
          isScrollable
          role="complementary"
          label="Workspace context"
        >
          <ContextRail />
        </LayoutPanel>
      ),
    [isNarrow],
  );

  return <Layout height="fill" header={header} content={content} end={rail} />;
}
