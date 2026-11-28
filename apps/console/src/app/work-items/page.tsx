'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { WorkItem, WorkItemStatus } from '@graveshift/core';

import { emptyWorkItemList, sampleWorkItemList } from '../../fixtures/work-items';

import { assignmentLabel } from './work-assignment';
import { priorityLabel, STATUS_LABELS, statusLabel } from './work-view';

const STATUS_VARIANT: Readonly<Record<WorkItemStatus, 'neutral' | 'blue' | 'teal' | 'green'>> = {
  todo: 'neutral',
  in_progress: 'blue',
  in_review: 'teal',
  done: 'green',
};

const PRIORITY_DOT: Readonly<
  Record<WorkItem['priority'], 'neutral' | 'accent' | 'warning' | 'error'>
> = {
  low: 'neutral',
  medium: 'accent',
  high: 'warning',
  critical: 'error',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
const SAMPLE_OPTIONS = [
  { value: 'all', label: 'Sample work items' },
  { value: 'empty', label: 'Empty sample response' },
];

const columns: TableColumn<WorkItem>[] = [
  {
    key: 'title',
    header: 'Work item',
    width: proportional(2, { minWidth: 240 }),
    renderCell: (item) => (
      <VStack gap={0}>
        <Link href={`/work-items/${item.id}`}>{item.title}</Link>
        <Text type="supporting" color="secondary">
          {item.id}
        </Text>
      </VStack>
    ),
  },
  {
    key: 'service',
    header: 'Service',
    width: proportional(1, { minWidth: 140 }),
    renderCell: (item) => <Text maxLines={1}>{item.service}</Text>,
  },
  {
    key: 'status',
    header: 'Status',
    width: pixel(140),
    renderCell: (item) => (
      <Badge variant={STATUS_VARIANT[item.status]} label={statusLabel(item.status)} />
    ),
  },
  {
    key: 'priority',
    header: 'Priority',
    width: pixel(130),
    renderCell: (item) => (
      <HStack gap={2} vAlign="center">
        <StatusDot
          variant={PRIORITY_DOT[item.priority]}
          label={priorityLabel(item.priority)}
          aria-hidden
        />
        <Text>{priorityLabel(item.priority)}</Text>
      </HStack>
    ),
  },
  {
    key: 'assignee',
    header: 'Assignment',
    width: proportional(1, { minWidth: 170 }),
    renderCell: (item) => <Text maxLines={1}>{assignmentLabel(item.assignee)}</Text>,
  },
  {
    key: 'fixPriority',
    header: 'Fix queue',
    width: pixel(100),
    renderCell: (item) => <Text>{item.fixPriority}</Text>,
  },
  {
    key: 'draftPr',
    header: 'Draft pull request',
    width: pixel(190),
    renderCell: (item) => (
      <Text maxLines={1}>
        {item.draftPr === null
          ? 'None in this sample'
          : `Sample pull request, ${item.draftPr.number}`}
      </Text>
    ),
  },
];

export default function WorkItemsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sampleResponse, setSampleResponse] = useState('all');

  const sample = sampleResponse === 'empty' ? emptyWorkItemList : sampleWorkItemList;
  const source = sample.payload;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.items.filter((item) => {
      if (status !== null && item.status !== status) return false;
      if (needle === '') return true;
      return [item.title, item.id, item.service, assignmentLabel(item.assignee)].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [source, query, status]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setStatus(null);
    setSampleResponse('all');
  }, []);

  const header = useMemo(
    () => (
      <LayoutHeader hasDivider label="Work item filters and table actions">
        <Section variant="transparent" padding={4}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Heading level={1}>Work items</Heading>
                  <Badge label="Sample" variant="neutral" />
                </HStack>
              </StackItem>
              <Button
                label="New work item"
                variant="primary"
                isDisabled
                tooltip="Sample only. No command is sent."
              />
            </HStack>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <TextInput
                    label="Search work items"
                    isLabelHidden
                    value={query}
                    onChange={setQuery}
                    placeholder="Search title, service or assignment"
                    startIcon="search"
                    size="sm"
                  />
                  <Selector
                    label="Status"
                    isLabelHidden
                    value={status}
                    onChange={setStatus}
                    hasClear
                    options={STATUS_OPTIONS}
                    size="sm"
                    variant="secondary"
                  />
                  <Selector
                    label="Sample response"
                    isLabelHidden
                    value={sampleResponse}
                    onChange={setSampleResponse}
                    options={SAMPLE_OPTIONS}
                    size="sm"
                    variant="secondary"
                  />
                  <Text type="supporting" color="secondary">
                    {rows.length} sample work item{rows.length === 1 ? '' : 's'}
                  </Text>
                </HStack>
              </StackItem>
              <Button label="Clear filters" variant="secondary" onClick={clearFilters} />
            </HStack>
          </VStack>
        </Section>
      </LayoutHeader>
    ),
    [clearFilters, query, status, sampleResponse, rows.length],
  );

  const content = useMemo(
    () => (
      <LayoutContent role="main" padding={4} label="Sample work items">
        <VStack gap={4}>
          <Banner status="info" title="Sample work items" description={sample.notice} />
          {rows.length === 0 ? (
            <EmptyState
              title="No sample work items match these filters"
              description="This view reads fixtures only. No API request was made."
            />
          ) : (
            <Table
              data={rows}
              columns={columns}
              idKey="id"
              density="balanced"
              dividers="rows"
              hasHover
              textOverflow="wrap"
              verticalAlign="top"
              rowCount={rows.length}
            />
          )}
        </VStack>
      </LayoutContent>
    ),
    [sample.notice, rows],
  );

  return <Layout height="fill" padding={0} header={header} content={content} />;
}
