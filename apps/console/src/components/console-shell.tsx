'use client';

import { AppShell } from '@astryxdesign/core/AppShell';
import { Divider } from '@astryxdesign/core/Divider';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';

import { GlobalAgentSheet } from './global-agent-sheet';

// Frame adapted from the Astryx `shell-side-nav` page template: AppShell owns
// the viewport-height regions, and the collapsible, resizable rail owns the
// grouped navigation. Content pages keep their own padding.
//
// Public fixture routes render without this frame: they own their own preview
// banners, and no authentication is performed here. Next App Router layouts
// are shared, so the boundary lives in this client shell instead of moving the
// page files into a route group owned by another worker.
interface NavItem {
  label: string;
  href: string;
}

interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

const groups: readonly NavGroup[] = [
  {
    title: 'General',
    items: [
      { label: 'Overview', href: '/overview' },
      { label: 'Work items', href: '/work-items' },
      { label: 'Credentials', href: '/credentials' },
      { label: 'Deployments', href: '/deployments' },
      { label: 'Agent', href: '/agent' },
      { label: 'Workflows', href: '/workflows' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { label: 'Integrations', href: '/integrations' },
      { label: 'Project settings', href: '/settings/project' },
      { label: 'Organization settings', href: '/settings/organization' },
      { label: 'Account', href: '/settings/account' },
    ],
  },
];

const RESIZABLE = { defaultWidth: 268, minWidth: 220, maxWidth: 360 } as const;
const PUBLIC_ROUTES = ['/sign-in', '/register', '/onboarding'] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function AuthenticatedConsole({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false);

  const activeLabel =
    groups.flatMap((group) => group.items).find((item) => item.href === pathname)?.label ??
    groups.flatMap((group) => group.items).find((item) => pathname.startsWith(`${item.href}/`))
      ?.label ??
    'Current page';

  const openAgentSheet = useCallback(() => setIsAgentSheetOpen(true), []);

  const sideNavFooter = useMemo(
    () => (
      <SideNavSection title="Agent sheet" isHeaderHidden>
        <SideNavItem label="Agent chat (sheet)" onClick={openAgentSheet} />
      </SideNavSection>
    ),
    [openAgentSheet],
  );

  const navHeader = useMemo(
    () => (
      <SideNavHeading
        heading="Graveshift"
        subheading="Sample · Checkout API"
        headingHref="/overview"
      />
    ),
    [],
  );

  const sideNav = useMemo(
    () => (
      <SideNav collapsible resizable={RESIZABLE} header={navHeader} footer={sideNavFooter}>
        {groups.map((group, index) => (
          <Fragment key={group.title}>
            {index > 0 ? <Divider /> : null}
            <SideNavSection title={group.title}>
              {group.items.map((item) => (
                <SideNavItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  isSelected={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                />
              ))}
            </SideNavSection>
          </Fragment>
        ))}
      </SideNav>
    ),
    [navHeader, sideNavFooter, pathname],
  );

  return (
    <Fragment>
      <AppShell contentPadding={0} variant="surface" sideNav={sideNav}>
        {children}
      </AppShell>
      <GlobalAgentSheet
        isOpen={isAgentSheetOpen}
        onOpenChange={setIsAgentSheetOpen}
        pageLabel={activeLabel}
      />
    </Fragment>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublicRoute(pathname)) {
    return <Fragment>{children}</Fragment>;
  }

  return <AuthenticatedConsole>{children}</AuthenticatedConsole>;
}
