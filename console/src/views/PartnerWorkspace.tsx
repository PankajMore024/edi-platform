import { useState } from 'react';
import { api, cert, isClient, Principal, Relationship, RelationshipDoc } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';
import { PartnerDocuments } from './PartnerDocuments';
import { Review } from './Review';
import { Board } from './Certification';
import { PartnerForm } from './PartnerForm';
import { ImportWizard } from './ImportWizard';
import { TransportForm } from './TransportForm';
import { MapForm } from './MapForm';
import { SpecForm } from './SpecForm';

type Tab = 'overview' | 'documents' | 'onboarding' | 'exceptions' | 'config';
const TABS: Array<[Tab, string, string]> = [
  ['overview', 'Overview & connection', '◈'], ['documents', 'Documents', '▦'],
  ['onboarding', 'Onboarding', '◎'], ['exceptions', 'Exceptions', '⚑'], ['config', 'Configuration', '⚙'],
];

// ── Onboarding: the certification board for THIS relationship (find its session, or open one) ──
function PartnerOnboarding({ rel, principal }: { rel: Relationship; principal: Principal }) {
  const sessions = useAsync(() => cert.sessions());
  const [busy, setBusy] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  if (sessions.loading) return <Loading />;
  if (sessions.error) return <ErrorBox msg={sessions.error} />;
  const mine = (sessions.data ?? []).filter((s) => s.relationshipId === rel.id);
  const sessionId = openedId ?? mine[mine.length - 1]?.id;
  if (sessionId) return <Board sessionId={sessionId} principal={principal} />;

  return (
    <div className="empty">
      No onboarding session for this partner yet.
      {isClient(principal) && <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await cert.open(rel.id); setOpenedId(r.session.id); } catch (e) { alert((e as Error).message); } finally { setBusy(false); } }}>
          {busy ? 'Opening…' : 'Open certification session'}
        </button>
      </div>}
    </div>
  );
}

// ── Overview: connection identity + document flow bindings ──
function Overview({ rel }: { rel: Relationship }) {
  const kv = (k: string, v: React.ReactNode) => <div className="kv"><div className="k">{k}</div><div className="v">{v}</div></div>;
  return (
    <div>
      <div className="conn">
        {kv('Status', rel.active ? <span className="pill p-ok"><span className="dot" />{rel.mode}</span> : <span className="pill p-idle"><span className="dot" />inactive</span>)}
        {kv('Format authority', `${rel.formatAuthority} · ${rel.tenantRole}`)}
        {kv('Version', <span className="mono">{rel.version}</span>)}
        {kv('ISA sender → receiver', <span className="mono">{rel.envelope.senderId} → {rel.envelope.receiverId}</span>)}
        {kv('GS version', <span className="mono">{rel.envelope.gsVersion}</span>)}
        {kv('Document flows', String(rel.documents.length))}
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h"><h3>Document flows</h3></div>
        <table>
          <thead><tr><th>Doc</th><th>Direction</th><th>Map</th><th>Spec</th><th>Connector</th><th>Enabled</th></tr></thead>
          <tbody>
            {rel.documents.map((d: RelationshipDoc, i) => (
              <tr key={i}>
                <td><span className="tag">{d.docType}</span></td>
                <td className="sub">{d.direction === 'inbound' ? 'inbound ◂' : 'outbound ▸'}</td>
                <td className="mono sub">{d.mapId || '—'}</td><td className="mono sub">{d.specId || '—'}</td>
                <td className="mono sub">{d.connectorInstanceId || '—'}</td><td className="sub">{d.enabled ? '✓' : '✕'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Configuration: co-located tools, reusing the existing editors ──
function Configuration({ rel, principal, onChanged }: { rel: Relationship; principal: Principal; onChanged: () => void }) {
  type Drawer = null | 'partner' | 'connector' | 'transport' | { map: string } | { spec: string };
  const [drawer, setDrawer] = useState<Drawer>(null);
  const close = () => setDrawer(null);
  const saved = () => { close(); onChanged(); };
  const ro = !isClient(principal);
  return (
    <div>
      <div className="grid cards" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
        <ConfigCard icon="⚏" title="Relationship" desc="Envelope identity, roles, and document flows." action="Edit" disabled={ro} onClick={() => setDrawer('partner')} />
        <ConfigCard icon="🧾" title="Connector" desc="How this partner's data maps to canonical." action="Import sample → new" disabled={ro} onClick={() => setDrawer('connector')} />
        <ConfigCard icon="🔐" title="Transport / SFTP" desc="How bytes move. Secrets stay in the vault." action="Configure" disabled={ro} onClick={() => setDrawer('transport')} />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h"><h3>Maps &amp; specs (per doc type)</h3></div>
        <table>
          <thead><tr><th>Doc</th><th>Map</th><th>Spec</th><th /></tr></thead>
          <tbody>
            {rel.documents.map((d, i) => (
              <tr key={i}>
                <td><span className="tag">{d.docType}</span></td>
                <td className="mono sub">{d.mapId || '—'}</td><td className="mono sub">{d.specId || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {d.mapId && <button className="link" style={{ marginRight: 12 }} onClick={() => setDrawer({ map: d.mapId })}>Edit map</button>}
                  {d.specId && <button className="link" onClick={() => setDrawer({ spec: d.specId! })}>Edit spec</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawer === 'partner' && <PartnerForm existing={rel} onClose={close} onSaved={saved} />}
      {drawer === 'connector' && <ImportWizard onClose={close} onSaved={saved} />}
      {drawer === 'transport' && <TransportForm onClose={close} onSaved={saved} />}
      {drawer && typeof drawer === 'object' && 'map' in drawer && <MapForm existingId={drawer.map} onClose={close} onSaved={saved} />}
      {drawer && typeof drawer === 'object' && 'spec' in drawer && <SpecForm existingId={drawer.spec} onClose={close} onSaved={saved} />}
    </div>
  );
}
const ConfigCard = ({ icon, title, desc, action, onClick, disabled }: { icon: string; title: string; desc: string; action: string; onClick: () => void; disabled?: boolean }) => (
  <div className="card"><div className="ch"><div className="ci">{icon}</div><div className="cn">{title}</div></div><div className="cd">{desc}</div>
    <button className="btn btn-sm btn-primary" style={{ marginTop: 12 }} disabled={disabled} onClick={onClick}>{action}</button></div>
);

export function PartnerWorkspace({ relationshipId, principal, onBack }: { relationshipId: string; principal: Principal; onBack: () => void }) {
  const rel = useAsync(() => api.relationship(relationshipId), [relationshipId]);
  const [tab, setTab] = useState<Tab>('overview');
  const badge = useAsync(() => api.review(relationshipId), [relationshipId]);

  if (rel.loading) return <Loading />;
  if (rel.error || !rel.data) return <ErrorBox msg={rel.error ?? 'not found'} />;
  const r = rel.data;

  return (
    <div className="view">
      <div className="ws-head">
        <div className="logo">{r.partnerId.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{r.partnerName ?? r.partnerId}</h1>
          <div className="sub mono">{r.envelope.senderId} → {r.envelope.receiverId} · {r.formatAuthority}-authoritative</div>
        </div>
      </div>
      <div className="ws-tabs">
        {TABS.map(([t, label, ic]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span style={{ width: 15, textAlign: 'center' }}>{ic}</span> {label}
            {t === 'exceptions' && (badge.data?.length ?? 0) > 0 && <span className="badge">{badge.data!.length}</span>}
          </button>
        ))}
      </div>
      <div className="ws-body">
        {tab === 'overview' && <Overview rel={r} />}
        {tab === 'documents' && <PartnerDocuments relationshipId={relationshipId} />}
        {tab === 'onboarding' && <PartnerOnboarding rel={r} principal={principal} />}
        {tab === 'exceptions' && <Review relationshipId={relationshipId} onChange={badge.reload} />}
        {tab === 'config' && <Configuration rel={r} principal={principal} onChanged={rel.reload} />}
      </div>
      <div style={{ marginTop: 20 }}><button className="btn btn-ghost btn-sm" onClick={onBack}>‹ All partners</button></div>
    </div>
  );
}
