import { useState } from 'react';
import { api, Descriptor, ConnectorInstanceRef, TransportInstance } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';
import { ImportWizard } from './ImportWizard';
import { TransportForm } from './TransportForm';

const ICON: Record<string, string> = { csv: '🧾', xlsx: '📊', database: '🗄️', shopify: '🛒', amazon: '📦', quickbooks: '💵', 'generic-rest': '🔌', sftp: '🔐', webhook: '🪝' };

const Card = ({ d }: { d: Descriptor }) => (
  <div className="card">
    <div className="ch">
      <div className="ci">{ICON[d.id] ?? '◆'}</div>
      <div><div className="cn">{d.name}</div><div className="ck">{d.class ?? d.mode ?? d.kind}</div></div>
    </div>
    <div className="cd">{d.description}</div>
  </div>
);

const Label = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--faint)', fontWeight: 600, margin: '0 0 9px', ...style }}>{children}</div>
);

export function Catalog() {
  const { data, loading, error } = useAsync(() => api.catalog());
  const instances = useAsync(() => api.connectors());
  const transports = useAsync(() => api.transports());
  const [wizard, setWizard] = useState(false);
  const [tform, setTform] = useState<{ mode: 'new' } | { mode: 'edit'; tp: TransportInstance } | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const configured = instances.data ?? [];
  const tps = transports.data ?? [];
  const endpoint = (tp: TransportInstance) => String(tp.settings.host ?? tp.settings.url ?? '—');
  return (
    <div className="view">
      <p className="intro">The building blocks onboarding composes. <b>Connectors</b> translate a client’s data to/from canonical; <b>transports</b> move the bytes. Import a client sample to generate a configured connector a relationship can point to.</p>

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-h"><h3>Configured connectors</h3><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setWizard(true)}>⤢ Import sample</button></div>
        {configured.length === 0
          ? <div className="empty">No connectors configured yet. <br />Import a client CSV or API payload to auto-map it to canonical fields.</div>
          : <table>
              <thead><tr><th>Connector id</th><th>Type</th><th>Doc types</th><th>Trigger</th></tr></thead>
              <tbody>{configured.map((c: ConnectorInstanceRef) => (
                <tr key={c.id}><td className="mono">{c.id}</td><td><span className="tag">{c.connectorType}</span></td><td className="mono sub">{c.docTypes.join(', ')}</td><td className="sub">{c.trigger}</td></tr>
              ))}</tbody>
            </table>}
      </div>

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-h"><h3>Configured transports</h3><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setTform({ mode: 'new' })}>+ Add transport</button></div>
        {tps.length === 0
          ? <div className="empty">No transports configured yet. <br />Add an SFTP or webhook endpoint to move bytes for a relationship.</div>
          : <table>
              <thead><tr><th>Transport id</th><th>Type</th><th>Endpoint</th><th>Direction</th><th>Credentials</th></tr></thead>
              <tbody>{tps.map((tp: TransportInstance) => (
                <tr key={tp.id} className="click" onClick={() => setTform({ mode: 'edit', tp })}>
                  <td className="mono">{tp.id.slice(0, 12)}</td><td><span className="tag">{tp.transportType}</span></td>
                  <td className="mono sub">{endpoint(tp)}</td><td className="sub">{tp.direction}</td>
                  <td className="sub">{tp.vaultRef ? <span className="mono">{tp.vaultRef}</span> : '— none'}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      <Label>Connector types · {data!.connectors.length}</Label>
      <div className="grid cards">{data!.connectors.map((c) => <Card key={c.id} d={c} />)}</div>
      <Label style={{ margin: '22px 0 9px' }}>Transports · {data!.transports.length}</Label>
      <div className="grid cards">{data!.transports.map((t) => <Card key={t.id} d={t} />)}</div>

      {wizard && <ImportWizard onClose={() => setWizard(false)} onSaved={() => { setWizard(false); instances.reload(); }} />}
      {tform?.mode === 'new' && <TransportForm onClose={() => setTform(null)} onSaved={() => { setTform(null); transports.reload(); }} />}
      {tform?.mode === 'edit' && <TransportForm existing={tform.tp} onClose={() => setTform(null)} onSaved={() => { setTform(null); transports.reload(); }} />}
    </div>
  );
}
