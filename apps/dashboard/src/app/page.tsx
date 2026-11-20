'use client';

import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { AuditPanel } from '../components/audit-panel';
import { FirstRunWizard } from '../components/first-run-wizard';
import { GraveyardGrid } from '../components/graveyard-grid';
import { HauntPanel } from '../components/haunt-panel';
import { IncidentList } from '../components/incident-list';
import { ModeView } from '../components/mode-view';
import { Shell } from '../components/shell';
import { Term } from '../components/term';
import { useGraveyard } from '../lib/use-graveyard';

export default function GraveyardPage() {
  const graveyard = useGraveyard();
  const isWide = useMediaQuery('(min-width: 1024px)');
  const needsSetup = graveyard.isError || (graveyard.isSuccess && graveyard.data.length === 0);
  const controls = (
    <VStack gap={4}>
      <ModeView />
      <HauntPanel />
      <AuditPanel />
    </VStack>
  );
  return (
    <Shell>
      <Layout
        height="auto"
        header={
          <LayoutHeader hasDivider>
            <VStack gap={1}>
              <Heading level={1}>
                <Term name="dashboard" />
              </Heading>
              <Text type="supporting">
                Watched services, open incidents and the decisions made about them
              </Text>
            </VStack>
          </LayoutHeader>
        }
        end={
          isWide ? (
            <LayoutPanel width={340} role="complementary" label="Controls">
              {controls}
            </LayoutPanel>
          ) : undefined
        }
        content={
          <LayoutContent>
            <VStack gap={6}>
              <FirstRunWizard needed={needsSetup} />
              <GraveyardGrid />
              <IncidentList />
              {isWide ? null : controls}
            </VStack>
          </LayoutContent>
        }
      />
    </Shell>
  );
}
