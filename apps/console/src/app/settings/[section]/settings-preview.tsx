'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Grid } from '@astryxdesign/core/Grid';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Heading, Text } from '@astryxdesign/core/Text';

import { sampleAccounts, sampleOrganizations, sampleProjects } from '../../../fixtures/identity';
import { SAMPLE_NOTICE, SAMPLE_TIMESTAMPS } from '../../../fixtures/sample';
import type { SettingsSection } from './page';

const account = sampleAccounts.find(({ id }) => id === 'account-password-change')?.payload;
const organization = sampleOrganizations[0]?.payload;
const project = sampleProjects[0]?.payload;

const sections: Array<{ key: SettingsSection; label: string }> = [
  { key: 'account', label: 'Account' },
  { key: 'organization', label: 'Organization' },
  { key: 'project', label: 'Project' },
];

const titles: Record<SettingsSection, string> = {
  account: 'Account settings',
  organization: 'Organization settings',
  project: 'Project settings',
};

const settingsColumns: { minWidth: number; max: number; repeat: 'fit' } = {
  minWidth: 260,
  max: 2,
  repeat: 'fit',
};

function errorStatus(message: string) {
  return { type: 'error' as const, message };
}

export function SettingsPreview({ section }: { section: SettingsSection }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [sampleSlug, setSampleSlug] = useState(project?.slug ?? '');
  const [slugNotice, setSlugNotice] = useState('');

  const slugStatus = useMemo(
    () => (slugNotice.startsWith('Use ') ? { status: errorStatus(slugNotice) } : {}),
    [slugNotice],
  );

  const previewPassword = useCallback(() => {
    setPasswordNotice(
      newPassword === '' || confirmPassword === ''
        ? 'Enter both sample values to see the preview message.'
        : 'Simulation only: no password was checked, stored, or changed.',
    );
  }, [newPassword, confirmPassword]);

  const toggleAccessDenied = useCallback(() => {
    setShowAccessDenied((current) => !current);
  }, []);

  const changeSlug = useCallback((value: string) => {
    setSampleSlug(value);
    setSlugNotice('');
  }, []);

  const previewSlug = useCallback(() => {
    setSlugNotice(
      /^[a-z0-9-]+$/.test(sampleSlug)
        ? 'Simulation only: the sample slug shape is valid. Nothing was saved.'
        : 'Use lowercase letters, numbers, and hyphens in the sample slug.',
    );
  }, [sampleSlug]);

  return (
    <Layout height="auto" padding={4}>
      <LayoutHeader hasDivider={false}>
        <VStack gap={3}>
          <Text type="label" color="secondary">
            SETTINGS
          </Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <Heading level={1}>{titles[section]}</Heading>
            </StackItem>
            <Badge label="Read-only preview" variant="neutral" />
          </HStack>
          <HStack gap={3} wrap="wrap">
            {sections.map((entry) => (
              <HStack key={entry.key} gap={1} vAlign="center">
                <Link href={`/settings/${entry.key}`} hasUnderline={entry.key === section}>
                  {entry.label}
                </Link>
                {entry.key === section && <Badge label="Current" variant="info" />}
              </HStack>
            ))}
          </HStack>
        </VStack>
      </LayoutHeader>
      <LayoutContent role="main" padding={4}>
        <VStack gap={4}>
          <Banner
            status="info"
            title="Fixture-only settings preview"
            description={`${SAMPLE_NOTICE} No setting can be changed here.`}
          />
          {section === 'account' && account && (
            <Grid columns={settingsColumns} gap={4}>
              <VStack gap={1}>
                <Heading level={2}>Account profile</Heading>
                <Text type="supporting" color="secondary">
                  The sample Account that requires a password change.
                </Text>
              </VStack>
              <VStack gap={3}>
                <MetadataList>
                  <MetadataListItem label="Email">{account.email}</MetadataListItem>
                  <MetadataListItem label="Password change">
                    {account.mustChangePassword ? 'Required' : 'Not required'}
                  </MetadataListItem>
                  <MetadataListItem label="Organizations">
                    {account.organizations.length} sample Organization
                  </MetadataListItem>
                </MetadataList>
                <Divider />
                <Heading level={3}>Password change preview</Heading>
                <FormLayout defaultOptionality="required">
                  <TextInput
                    label="New sample password"
                    type="password"
                    autoComplete="new-password"
                    isRequired
                    value={newPassword}
                    onChange={setNewPassword}
                    description="No value is stored or verified."
                  />
                  <TextInput
                    label="Confirm sample password"
                    type="password"
                    autoComplete="new-password"
                    isRequired
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                  />
                </FormLayout>
                <Button label="Preview validation" variant="secondary" onClick={previewPassword} />
                {passwordNotice !== '' && (
                  <Banner status="warning" title="Preview result" description={passwordNotice} />
                )}
              </VStack>
            </Grid>
          )}
          {section === 'organization' && organization && (
            <Grid columns={settingsColumns} gap={4}>
              <VStack gap={1}>
                <Heading level={2}>Organization record</Heading>
                <Text type="supporting" color="secondary">
                  The sample Organization that owns Projects.
                </Text>
              </VStack>
              <VStack gap={3}>
                <MetadataList>
                  <MetadataListItem label="Name">{organization.name}</MetadataListItem>
                  <MetadataListItem label="Slug">{organization.slug}</MetadataListItem>
                  <MetadataListItem label="ID">{organization.id}</MetadataListItem>
                  <MetadataListItem label="Created">{SAMPLE_TIMESTAMPS.date}</MetadataListItem>
                </MetadataList>
                <Divider />
                <Heading level={3}>Unavailable state preview</Heading>
                <Text type="supporting" color="secondary">
                  No management action is connected. The fixture also carries an access-denied state
                  with no permission contract.
                </Text>
                <Button
                  label={showAccessDenied ? 'Hide access-denied preview' : 'Preview access denied'}
                  variant="secondary"
                  onClick={toggleAccessDenied}
                />
                {showAccessDenied && (
                  <Banner
                    status="warning"
                    title="Sample access-denied state"
                    description="This is a fixture state only. No permission rule is invented by this preview."
                  />
                )}
              </VStack>
            </Grid>
          )}
          {section === 'project' && project && (
            <Grid columns={settingsColumns} gap={4}>
              <VStack gap={1}>
                <Heading level={2}>Project record</Heading>
                <Text type="supporting" color="secondary">
                  A Project shares one numeric id with its Event subject.
                </Text>
              </VStack>
              <VStack gap={3}>
                <MetadataList>
                  <MetadataListItem label="Name">{project.name}</MetadataListItem>
                  <MetadataListItem label="Project ID">{project.projectId}</MetadataListItem>
                  <MetadataListItem label="Slug">{project.slug}</MetadataListItem>
                  <MetadataListItem label="Organization ID">{project.orgId}</MetadataListItem>
                  <MetadataListItem label="Created">{SAMPLE_TIMESTAMPS.date}</MetadataListItem>
                </MetadataList>
                <Divider />
                <Heading level={3}>Validation preview</Heading>
                <TextInput
                  label="Sample slug"
                  value={sampleSlug}
                  onChange={changeSlug}
                  description="Lowercase letters, numbers, and hyphens."
                  {...slugStatus}
                />
                <Button label="Preview validation" variant="secondary" onClick={previewSlug} />
                {slugNotice !== '' && (
                  <Banner status="warning" title="Preview result" description={slugNotice} />
                )}
              </VStack>
            </Grid>
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
