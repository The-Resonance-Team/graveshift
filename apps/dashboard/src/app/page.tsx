'use client';

import { AuditPanel } from '../components/audit-panel';
import { FirstRunWizard } from '../components/first-run-wizard';
import { GraveyardGrid } from '../components/graveyard-grid';
import { HauntPanel } from '../components/haunt-panel';
import { IncidentList } from '../components/incident-list';
import { ModeView } from '../components/mode-view';
import { Shell } from '../components/shell';
import { useGraveyard } from '../lib/use-graveyard';

export default function GraveyardPage() {
  const graveyard = useGraveyard();
  const needsSetup = graveyard.isError || (graveyard.isSuccess && graveyard.data.length === 0);
  return (
    <Shell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FirstRunWizard needed={needsSetup} />
          <GraveyardGrid />
          <IncidentList />
        </div>
        <aside className="space-y-4" aria-label="Controls">
          <ModeView />
          <HauntPanel />
          <AuditPanel />
        </aside>
      </div>
    </Shell>
  );
}
