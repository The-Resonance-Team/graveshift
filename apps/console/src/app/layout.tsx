import './globals.css'; // First: declares the cascade-layer order before any Astryx CSS.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';

import { defaultThemeSlug, themes } from '../astryx-themes';
import { ConsoleShell } from '../components/console-shell';

export const metadata: Metadata = {
  title: 'Graveshift Console',
  description: 'A sample operations workspace for Graveshift',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Theme theme={themes[defaultThemeSlug]} mode="dark">
          <ConsoleShell>{children}</ConsoleShell>
        </Theme>
      </body>
    </html>
  );
}
