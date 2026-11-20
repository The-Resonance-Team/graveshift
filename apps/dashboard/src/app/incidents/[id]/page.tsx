'use client';

import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { use } from 'react';

import { IncidentTimeline } from '../../../components/incident-timeline';
import { Shell } from '../../../components/shell';
import { Term } from '../../../components/term';
import { formatTime } from '../../../lib/data/incident-model';
import { useIncident } from '../../../lib/use-incidents';

export default function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isPending, isError, error } = useIncident(decodeURIComponent(id));
  return (
    <Shell>
      <Layout
        height="auto"
        header={
          <LayoutHeader hasDivider>
            <VStack gap={2}>
              <Link href="/" type="supporting">
                Back to the graveyard
              </Link>
              {isPending ? (
                <Text type="supporting" role="status">
                  Loading the incident…
                </Text>
              ) : isError ? (
                <Text role="alert">
                  This incident could not be loaded ({error.message}). Incidents are kept in daemon
                  memory, so a restart clears them.
                </Text>
              ) : (
                <VStack gap={1}>
                  <Heading level={1}>
                    <Term name="incident" /> on {data.incident.service}
                  </Heading>
                  <Text type="supporting">
                    {data.severity}, {data.incident.state.replace('_', ' ')}, opened{' '}
                    {formatTime(data.incident.openedAt)} (Asia/Ho_Chi_Minh)
                  </Text>
                </VStack>
              )}
            </VStack>
          </LayoutHeader>
        }
        content={<LayoutContent>{data ? <IncidentTimeline view={data} /> : null}</LayoutContent>}
      />
    </Shell>
  );
}
