import { useState } from 'react';
import { api } from '../api';
import { useAsync } from '../useAsync';
import { ImportWizard } from './ImportWizard';
import { TransportForm } from './TransportForm';
import { MapForm } from './MapForm';
import { SpecForm } from './SpecForm';
import { PartnerForm } from './PartnerForm';

type Sub = null | 'connector' | 'transport' | 'map' | 'spec' | 'relationship';

/**
 * Guided onboarding — a stepper that walks an operator through a new partner in the natural order and
 * launches the SAME drawers used elsewhere (no duplicate editors). Each drawer persists on its own, so
 * by the relationship step its dropdowns already list what was just created. Steps 1–3 are optional
 * (an existing artifact can be reused); step 4 creates the relationship and finishes.
 */
export function GuidedOnboard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [sub, setSub] = useState<Sub>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const connectors = useAsync(() => api.connectors());
  const transports = useAsync(() => api.transports());
  const maps = useAsync(() => api.partnerMaps());
  const specs = useAsync(() => api.specs());

  const mark = (k: string, reload: () => void) => { setDone((d) => ({ ...d, [k]: true })); reload(); setSub(null); };
  const count = (k: string): number =>
    k === 'connector' ? (connectors.data?.length ?? 0) : k === 'transport' ? (transports.data?.length ?? 0)
      : k === 'map' ? (maps.data?.length ?? 0) : (specs.data?.length ?? 0);

  const STEPS: Array<{ key: string; n: number; title: string; desc: string; actions: Array<{ label: string; go: Sub }> }> = [
    { key: 'connector', n: 1, title: 'Connector', desc: 'Import a client CSV/API sample so we can map their data to canonical fields.', actions: [{ label: 'Import sample', go: 'connector' }] },
    { key: 'transport', n: 2, title: 'Transport', desc: 'How bytes move — an SFTP or webhook endpoint. Optional if delivered another way.', actions: [{ label: 'Add transport', go: 'transport' }] },
    { key: 'translation', n: 3, title: 'Translation', desc: 'The X12 ⇄ canonical map, and optionally a conformance spec to validate against.', actions: [{ label: 'New map', go: 'map' }, { label: 'New spec', go: 'spec' }] },
    { key: 'relationship', n: 4, title: 'Relationship', desc: 'Tie it together — envelope identity and the document flows that reference the above.', actions: [{ label: 'Create relationship', go: 'relationship' }] },
  ];

  const isDone = (k: string): boolean => k === 'translation' ? (!!done.map || !!done.spec) : !!done[k];

  return (
    <>
    <div className="scrim center" onClick={onClose}>
      <div className="guide" onClick={(e) => e.stopPropagation()}>
        <div className="guide-h">
          <div><div className="crumb">Configure → Partners</div><h2>Onboard a partner</h2></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p className="intro" style={{ margin: '0 0 6px' }}>Work top to bottom, or skip a step and reuse something you already have. Each step saves on its own.</p>

        <div className="gsteps">
          {STEPS.map((s) => {
            const existing = s.key === 'translation' ? (count('map') + count('spec')) : count(s.key);
            const doneHere = isDone(s.key);
            return (
              <div className={`gstep${doneHere ? ' done' : ''}`} key={s.key}>
                <div className="gnum">{doneHere ? '✓' : s.n}</div>
                <div className="gbody">
                  <div className="gt">{s.title}{s.key !== 'relationship' && <span className="opt">optional</span>}{existing > 0 && <span className="have">{existing} existing</span>}</div>
                  <div className="gd">{s.desc}</div>
                </div>
                <div className="gacts">
                  {s.actions.map((a) => (
                    <button key={a.label} className={`btn btn-sm ${s.key === 'relationship' ? 'btn-primary' : ''}`} onClick={() => setSub(a.go)}>{a.label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {sub === 'connector' && <ImportWizard onClose={() => setSub(null)} onSaved={() => mark('connector', connectors.reload)} />}
    {sub === 'transport' && <TransportForm onClose={() => setSub(null)} onSaved={() => mark('transport', transports.reload)} />}
    {sub === 'map' && <MapForm onClose={() => setSub(null)} onSaved={() => mark('map', maps.reload)} />}
    {sub === 'spec' && <SpecForm onClose={() => setSub(null)} onSaved={() => mark('spec', specs.reload)} />}
    {sub === 'relationship' && <PartnerForm onClose={() => setSub(null)} onSaved={() => { onDone(); }} />}
    </>
  );
}
