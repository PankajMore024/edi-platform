import { useState } from 'react';
import { api } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';
import { PartnerForm } from './PartnerForm';
import { GuidedOnboard } from './GuidedOnboard';

const initials = (s: string) => s.slice(0, 2).toUpperCase();

export function Partners({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, loading, error, reload } = useAsync(() => api.relationships());
  const [form, setForm] = useState(false);
  const [guide, setGuide] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const rels = data ?? [];
  return (
    <div className="view">
      <p className="intro">This client’s trading partners. Open a partner for its documents, onboarding, exceptions, and configuration.</p>
      <div className="panel">
        <div className="panel-h"><h3>Partners</h3><div className="spacer" /><button className="btn btn-sm" onClick={() => setGuide(true)}>✦ Guide me</button><button className="btn btn-primary btn-sm" onClick={() => setForm(true)}>+ Add partner</button></div>
        {rels.length === 0 && <div className="empty">No trading partners yet. <br />Add your first partner to start processing documents.</div>}
        {rels.map((r) => (
          <div className="partner click" key={r.id} onClick={() => onOpen(r.id)}>
            <div className="logo">{initials(r.partnerId)}</div>
            <div style={{ flex: 1 }}>
              <div className="pn">{r.partnerName ?? r.partnerId}</div>
              <div className="pm"><span className="mono">{r.envelope.senderId} → {r.envelope.receiverId}</span> · {r.tenantRole} · {r.formatAuthority} · v{r.version}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.documents.map((d, i) => <span className={`flow${d.enabled ? '' : ' off'}`} key={i}>{d.docType} {d.direction === 'inbound' ? '◂' : '▸'}</span>)}
            </div>
            <span className={`tag ${r.active ? 't-on' : ''}`} style={{ marginLeft: 12 }}>{r.active ? r.mode : 'inactive'}</span>
            <span className="chev">›</span>
          </div>
        ))}
      </div>
      {form && <PartnerForm onClose={() => setForm(false)} onSaved={(): void => { setForm(false); reload(); }} />}
      {guide && <GuidedOnboard onClose={() => setGuide(false)} onDone={() => { setGuide(false); reload(); }} />}
    </div>
  );
}
