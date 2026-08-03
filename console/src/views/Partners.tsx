import { api, Relationship } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';

const initials = (s: string) => s.slice(0, 2).toUpperCase();

export function Partners() {
  const { data, loading, error } = useAsync(() => api.relationships());
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const rels = data ?? [];
  return (
    <div className="view">
      <p className="intro">Trading relationships — each configures one client↔partner integration: envelope identity, format authority, transport, and the document flows.</p>
      <div className="panel">
        <div className="panel-h"><h3>Relationships</h3><div className="spacer" /><button className="btn btn-primary btn-sm" disabled>+ Add partner</button></div>
        {rels.length === 0 && <div className="empty">No trading relationships configured yet.</div>}
        {rels.map((r: Relationship) => (
          <div className="partner" key={r.id}>
            <div className="logo">{initials(r.partnerId)}</div>
            <div style={{ flex: 1 }}>
              <div className="pn">{r.partnerId}</div>
              <div className="pm"><span className="mono">{r.envelope.senderId} → {r.envelope.receiverId}</span> · {r.tenantRole} · {r.formatAuthority} · v{r.version}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.documents.map((d, i) => <span className="flow" key={i}>{d.docType} {d.direction === 'inbound' ? '◂' : '▸'}</span>)}
            </div>
            <span className="tag" style={{ marginLeft: 12 }}>{r.mode}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
