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

import { sampleCredentialList, type SampleCredentialMetadata } from '../../fixtures/credentials';
import { SAMPLE_NOTICE, SAMPLE_TIMESTAMPS } from '../../fixtures/sample';

type CredentialStatus = 'Active' | 'Expired' | 'Revoked';

interface CredentialRow extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  status: CredentialStatus;
  scopes: string;
  service: string;
  expires: string;
  revoked: string;
}

const statusVariant: Record<CredentialStatus, 'success' | 'warning' | 'neutral'> = {
  Active: 'success',
  Expired: 'warning',
  Revoked: 'neutral',
};

const kindOptions = [
  { value: 'MCP credential', label: 'MCP credential' },
  { value: 'Plugin credential', label: 'Plugin credential' },
];

const statusOptions = [
  { value: 'Active', label: 'Active' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Revoked', label: 'Revoked' },
];

const timestampFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

// ponytail: sample review anchor, upgrade if credentials become live.
const reviewAnchor = Date.parse(SAMPLE_TIMESTAMPS.anchor);

function formatTimestamp(timestamp: string | null): string {
  return timestamp === null ? '—' : timestampFormat.format(new Date(timestamp));
}

function credentialStatus(credential: SampleCredentialMetadata): CredentialStatus {
  if (credential.revokedAt !== null) return 'Revoked';
  if (credential.expiresAt !== null && Date.parse(credential.expiresAt) <= reviewAnchor) {
    return 'Expired';
  }
  return 'Active';
}

const rows: CredentialRow[] = sampleCredentialList.payload.items.map((credential) => ({
  id: credential.id,
  name: credential.name,
  kind: credential.kind === 'mcp' ? 'MCP credential' : 'Plugin credential',
  status: credentialStatus(credential),
  scopes: credential.scopes.join(', '),
  service: credential.service ?? '—',
  expires: formatTimestamp(credential.expiresAt),
  revoked: formatTimestamp(credential.revokedAt),
}));

const columns: TableColumn<CredentialRow>[] = [
  { key: 'name', header: 'Credential', width: proportional(1, { minWidth: 140 }) },
  { key: 'kind', header: 'Kind', width: proportional(1, { minWidth: 120 }) },
  {
    key: 'status',
    header: 'State',
    width: proportional(1, { minWidth: 110 }),
    renderCell: (row) => <Badge label={row.status} variant={statusVariant[row.status]} />,
  },
  { key: 'scopes', header: 'Scopes', width: proportional(1, { minWidth: 130 }) },
  { key: 'service', header: 'Service', width: proportional(1, { minWidth: 120 }) },
  { key: 'expires', header: 'Expires', width: proportional(1, { minWidth: 140 }) },
  { key: 'revoked', header: 'Revoked', width: proportional(1, { minWidth: 140 }) },
];

export default function CredentialsPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (needle === '' ||
          Object.values(row).some((value) => String(value).toLowerCase().includes(needle))) &&
        (kind === null || row.kind === kind) &&
        (status === null || row.status === status),
    );
  }, [query, kind, status]);

  const hasFilters = query !== '' || kind !== null || status !== null;
  const clearAll = useCallback(() => {
    setQuery('');
    setKind(null);
    setStatus(null);
  }, []);

  return (
    <Layout height="fill" padding={0}>
      <LayoutHeader hasDivider label="Credential filters and table actions">
        <Section variant="transparent" padding={4}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Text type="label" color="secondary">
                    MANAGE
                  </Text>
                  <Heading level={1}>Credentials</Heading>
                </VStack>
              </StackItem>
              <Badge label="Metadata only" variant="neutral" />
            </HStack>
            <Text type="supporting" color="secondary">
              {SAMPLE_NOTICE} No value, prefix, hash, or credential action is available.
            </Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <TextInput
                label="Search credentials"
                isLabelHidden
                placeholder="Search credentials"
                size="sm"
                width={220}
                value={query}
                onChange={setQuery}
                startIcon="search"
                hasClear
              />
              <Selector
                label="Kind"
                options={kindOptions}
                value={kind}
                onChange={setKind}
                hasClear
                isLabelHidden
                size="sm"
                placeholder="Kind"
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
            </HStack>
          </VStack>
        </Section>
      </LayoutHeader>
      <LayoutContent role="main" padding={4} label="Credentials">
        {filtered.length === 0 ? (
          <EmptyState
            title="No credentials match these filters"
            description="Clear the search or a filter to see the sample metadata."
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
