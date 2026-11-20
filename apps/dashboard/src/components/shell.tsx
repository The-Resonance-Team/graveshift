'use client';

import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavItem } from '@astryxdesign/core/TopNav';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

import { useLive } from '../lib/use-live';
import { LiveStatus } from './live-status';

export function Shell({ children }: { children: ReactNode }) {
  const live = useLive();
  return (
    <AppShell
      height="auto"
      variant="section"
      contentPadding={4}
      topNav={
        <TopNav
          label="Primary"
          heading={
            <Text type="label" color="accent">
              Graveshift
            </Text>
          }
          startContent={<TopNavItem label="Graveyard" href="/" isSelected />}
          endContent={
            <HStack gap={2}>
              <Text type="supporting">The Graveyard of your services</Text>
              <LiveStatus state={live} />
            </HStack>
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
