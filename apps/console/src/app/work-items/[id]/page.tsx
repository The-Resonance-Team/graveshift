import { notFound } from 'next/navigation';

import { sampleWorkItems } from '../../../fixtures/work-items';

import { WorkItemView } from './work-item-view';

export default async function WorkItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = sampleWorkItems.find((entry) => entry.payload.id === id);
  if (sample === undefined) notFound();

  return <WorkItemView id={id} />;
}
