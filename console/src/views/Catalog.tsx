import { useState } from 'react';
import { api, Descriptor, ConnectorInstanceRef } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';
import { ImportWizard } from './ImportWizard';

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
  const [wizard, setWizard] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const configured = instances.data ?? [];
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

      <Label>Connector types · {data!.connectors.length}</Label>
      <div className="grid cards">{data!.connectors.map((c) => <Card key={c.id} d={c} />)}</div>
      <Label style={{ margin: '22px 0 9px' }}>Transports · {data!.transports.length}</Label>
      <div className="grid cards">{data!.transports.map((t) => <Card key={t.id} d={t} />)}</div>

      {wizard && <ImportWizard onClose={() => setWizard(false)} onSaved={() => { setWizard(false); instances.reload(); }} />}
    </div>
  );
}
