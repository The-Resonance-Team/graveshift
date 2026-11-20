'use client';

import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { graveStatus, type GraveTone } from '../lib/data/incident-model';
import type { Grave } from '../lib/types';
import { Term } from './term';

const TONE: Record<GraveTone, 'success' | 'warning' | 'error'> = {
  calm: 'success',
  warning: 'warning',
  critical: 'error',
};

export function GraveCard({ grave }: { grave: Grave }) {
  const status = graveStatus(grave);
  const body = (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} hAlign="between" wrap="wrap">
          <Heading level={3} maxLines={1}>
            {grave.name}
          </Heading>
          <Text type="supporting">{grave.runtime === 'k8s' ? 'Kubernetes' : 'Docker'}</Text>
        </HStack>
        <HStack gap={1} vAlign="center">
          <StatusDot variant={TONE[status.tone]} label={status.plain} />
          <Text type="label">{status.term ? <Term name={status.term} /> : status.plain}</Text>
        </HStack>
        {status.term ? (
          <Text type="supporting">
            {status.term === 'incident' ? status.plain : 'Service is healthy'}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
  return grave.incidentId ? (
    <Link
      href={`/incidents/${encodeURIComponent(grave.incidentId)}`}
      aria-label={`${grave.name}: open the incident timeline`}
    >
      {body}
    </Link>
  ) : (
    body
  );
}
