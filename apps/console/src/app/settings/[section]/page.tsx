import { notFound } from 'next/navigation';

import { SettingsPreview } from './settings-preview';

export const SETTINGS_SECTIONS = ['account', 'organization', 'project'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export default async function SettingsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(SETTINGS_SECTIONS as readonly string[]).includes(section)) notFound();
  return <SettingsPreview section={section as SettingsSection} />;
}
