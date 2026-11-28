'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
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
import { Selector } from '@astryxdesign/core/Selector';
import { Step, Stepper } from '@astryxdesign/core/Stepper';
import { Heading, Text } from '@astryxdesign/core/Text';

import { sampleAccounts, sampleProjects } from '../../fixtures/identity';
import { SAMPLE_NOTICE } from '../../fixtures/sample';
import { StepFields, type StepKey } from './step-fields';

const accounts = sampleAccounts.filter(
  ({ id }) => id === 'account-password-change' || id === 'account-owner',
);
const accountOptions = accounts.map(({ id, payload }) => ({
  value: id,
  label: `${payload.email}${payload.mustChangePassword ? ' · change required' : ' · no change'}`,
}));
const projectOptions = sampleProjects.map(({ payload }) => ({
  value: payload.projectId,
  label: `${payload.name} · ${payload.projectId}`,
}));

const stepLabels: Record<StepKey, string> = {
  password: 'Password',
  organization: 'Organization',
  project: 'Project',
  checklist: 'Overview checklist',
};

export default function OnboardingPage() {
  const [accountId, setAccountId] = useState('account-password-change');
  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [projectMode, setProjectMode] = useState('select');
  const [selectedProject, setSelectedProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sourceMode, setSourceMode] = useState('later');
  const [stepError, setStepError] = useState('');
  const [completed, setCompleted] = useState(false);

  const account = accounts.find((entry) => entry.id === accountId)?.payload;
  const steps: StepKey[] =
    account?.mustChangePassword === true
      ? ['password', 'organization', 'project', 'checklist']
      : ['organization', 'project', 'checklist'];
  const stepKey: StepKey = steps[step] ?? 'organization';

  const validate = useCallback(
    (current: StepKey) => {
      if (current === 'password') {
        if (newPassword.length < 8) return 'Use at least 8 characters in the sample password.';
        if (newPassword !== confirmPassword) return 'The sample passwords do not match.';
      }
      if (current === 'organization') {
        if (orgName.trim() === '') return 'Enter a sample Organization name.';
        if (!/^[a-z0-9-]+$/.test(orgSlug)) {
          return 'Use lowercase letters, numbers, and hyphens for the sample slug.';
        }
      }
      if (current === 'project') {
        if (projectMode === 'select' && selectedProject === '') return 'Select a sample Project.';
        if (projectMode === 'create' && newProjectName.trim() === '') {
          return 'Enter a name for the sample Project.';
        }
        if (projectMode === 'create' && !/^[a-z0-9-]+$/.test(newProjectSlug)) {
          return 'Use lowercase letters, numbers, and hyphens for the sample slug.';
        }
      }
      return '';
    },
    [
      newPassword,
      confirmPassword,
      orgName,
      orgSlug,
      projectMode,
      selectedProject,
      newProjectName,
      newProjectSlug,
    ],
  );

  const firstIncompleteIndex = steps.findIndex((key) => validate(key) !== '');
  const unlockedIndex = firstIncompleteIndex === -1 ? steps.length - 1 : firstIncompleteIndex;

  const changeAccount = useCallback((value: string) => {
    setAccountId(value);
    setStep(0);
    setStepError('');
    setCompleted(false);
    setOrgName('');
    setOrgSlug('');
    setProjectMode('select');
    setSelectedProject('');
    setNewProjectName('');
    setNewProjectSlug('');
    setNewPassword('');
    setConfirmPassword('');
    setSourceMode('later');
  }, []);

  const goNext = useCallback(() => {
    const message = validate(stepKey);
    setStepError(message);
    if (message !== '') return;
    if (step === steps.length - 1) {
      setCompleted(true);
      return;
    }
    setStep((current) => current + 1);
  }, [step, stepKey, steps.length, validate]);

  const goBack = useCallback(() => {
    setStepError('');
    setStep((current) => Math.max(0, current - 1));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (index > unlockedIndex) return;
      setStepError('');
      setCompleted(false);
      setStep(index);
    },
    [unlockedIndex],
  );

  const projectLabel =
    projectMode === 'select'
      ? (projectOptions.find((option) => option.value === selectedProject)?.label ?? 'Not selected')
      : `${newProjectName} · sample slug ${newProjectSlug}`;

  const checklistItems = useMemo(
    () => [
      { label: 'Account', value: account?.email ?? '' },
      {
        label: 'Password',
        value:
          account?.mustChangePassword === true
            ? 'Change previewed, not saved'
            : 'No change required',
      },
      { label: 'Organization', value: `${orgName} · ${orgSlug}` },
      { label: 'Project', value: projectLabel },
      { label: 'Source', value: sourceMode === 'later' ? 'Deferred' : 'Not connected' },
    ],
    [account, orgName, orgSlug, projectLabel, sourceMode],
  );

  return (
    <Layout height="auto" padding={4}>
      <LayoutHeader hasDivider={false}>
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  SAMPLE ONBOARDING
                </Text>
                <Heading level={1}>Set up your workspace</Heading>
              </VStack>
            </StackItem>
            <Badge label="Simulation only" variant="neutral" />
          </HStack>
          <Selector
            label="Sample account"
            options={accountOptions}
            value={accountId}
            onChange={changeAccount}
            size="sm"
            placeholder="Sample account"
          />
          <Stepper
            activeStep={step}
            orientation="horizontal"
            onStepClick={goTo}
            label="Onboarding progress"
            indicatorPosition="on-track"
          >
            {steps.map((key, index) => (
              <Step
                key={key}
                step={index}
                label={stepLabels[key]}
                isDisabled={index > unlockedIndex}
              />
            ))}
          </Stepper>
          <Text type="supporting" color="secondary">
            Complete a step to unlock the next one. Earlier steps stay available to revisit.
          </Text>
        </VStack>
      </LayoutHeader>
      <LayoutContent role="main" padding={4}>
        <VStack gap={4}>
          <Banner
            status="info"
            title="Fixture-only preview"
            description={`${SAMPLE_NOTICE} No password, Organization, Project, or source is created or changed.`}
          />
          {completed ? (
            <VStack gap={3}>
              <Heading level={2}>Preview summary</Heading>
              <MetadataList>
                {checklistItems.map((item) => (
                  <MetadataListItem key={item.label} label={item.label}>
                    {item.value}
                  </MetadataListItem>
                ))}
              </MetadataList>
              <Text type="supporting" color="secondary">
                No fixture was written and no source was connected.
              </Text>
              <Link href="/overview">Open the sample Overview</Link>
            </VStack>
          ) : (
            <VStack gap={4}>
              {stepError !== '' && (
                <Banner status="error" title="Check this step" description={stepError} />
              )}
              <StepFields
                stepKey={stepKey}
                projectOptions={projectOptions}
                checklistItems={checklistItems}
                orgName={orgName}
                setOrgName={setOrgName}
                orgSlug={orgSlug}
                setOrgSlug={setOrgSlug}
                projectMode={projectMode}
                setProjectMode={setProjectMode}
                selectedProject={selectedProject}
                setSelectedProject={setSelectedProject}
                newProjectName={newProjectName}
                setNewProjectName={setNewProjectName}
                newProjectSlug={newProjectSlug}
                setNewProjectSlug={setNewProjectSlug}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                confirmPassword={confirmPassword}
                setConfirmPassword={setConfirmPassword}
                sourceMode={sourceMode}
                setSourceMode={setSourceMode}
              />
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Button label="Back" variant="secondary" isDisabled={step === 0} onClick={goBack} />
                <StackItem size="fill">
                  <Text type="supporting" color="secondary">
                    {step + 1} of {steps.length}
                  </Text>
                </StackItem>
                <Button
                  label={step === steps.length - 1 ? 'Preview summary' : 'Next'}
                  variant="primary"
                  onClick={goNext}
                />
              </HStack>
              <Link href="/sign-in">Return to sign-in preview</Link>
            </VStack>
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
