'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useLive } from '../lib/use-live';
import { LiveStatus } from './live-status';
import { Term } from './term';

export function Shell({ children }: { children: ReactNode }) {
  const live = useLive();
  return (
    <>
      <header className="border-b border-mist">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/"
            className="text-lg font-bold text-ectoplasm focus-visible:outline-2 focus-visible:outline-ectoplasm"
          >
            Graveshift
          </Link>
          <p className="text-sm text-fog">
            The <Term name="dashboard" /> of your services
          </p>
          <LiveStatus state={live} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </>
  );
}
