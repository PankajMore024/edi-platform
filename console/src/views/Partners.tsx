import { useState } from 'react';
import { api, Relationship } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';
import { PartnerForm } from './PartnerForm';

const initials = (s: string) => s.slice(0, 2).toUpperCase();

export function Partners() {
  const { data, loading, error, reload } = useAsync(() => api.relationships());
  const [form, setForm] = useState<{ mode: 'new' } | { mode: 'edit'; rel: Relationship } | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const rels = data ?? [];
  return (
    <div className="view">
      <p className="intro">Trading relationships — each configures one client↔partner integration: envelope identity, format authority, transport, and the document flows.</p>
      <div className="panel">
        <div className="panel-h"><h3>Relationships</h3><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setForm({ mode: 'new' })}>+ Add partner</button></div>
        {rels.length === 0 && <div className="empty">No trading relationships configured yet. <br />Add your first partner to start processing documents.</div>}
        {rels.map((r) => (
          <div className="partner click" key={r.id} onClick={() => setForm({ mode: 'edit', rel: r })}>
            <div className="logo">{initials(r.partnerId)}</div>
            <div style={{ flex: 1 }}>
              <div className="pn">{r.partnerName ?? r.partnerId}</div>
              <div className="pm"><span className="mono">{r.envelope.senderId} → {r.envelope.receiverId}</span> · {r.tenantRole} · {r.formatAuthority} · v{r.version}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.documents.map((d, i) => <span className={`flow${d.enabled ? '' : ' off'}`} key={i}>{d.docType} {d.direction === 'inbound' ? '◂' : '▸'}</span>)}
            </div>
            <span className={`tag ${r.active ? 't-on' : ''}`} style={{ marginLeft: 12 }}>{r.active ? r.mode : 'inactive'}</span>
          </div>
        ))}
      </div>
      {form?.mode === 'new' && <PartnerForm onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      {form?.mode === 'edit' && <PartnerForm existing={form.rel} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
