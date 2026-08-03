import { useState } from 'react';
import { api, Relationship, RelationshipDoc, MapRef, SpecRef, ConnectorInstanceRef } from '../api';
import { useAsync } from '../useAsync';

const DOC_TYPES = ['850', '855', '856', '810', '846', '997'];
const blankDoc = (): RelationshipDoc => ({ docType: '850', direction: 'inbound', mapId: '', specId: '', connectorInstanceId: '', enabled: true });

// A fresh relationship with sensible envelope defaults so the backend's required ISA/GS fields are present.
const blank = (): Relationship => ({
  id: '', tenantId: '', partnerId: '', partnerName: '', formatAuthority: 'partner', tenantRole: 'buyer',
  version: '004010', mode: 'test', active: true,
  envelope: { senderQualifier: 'ZZ', senderId: '', receiverQualifier: 'ZZ', receiverId: '', gsVersion: '004010' },
  documents: [blankDoc()],
});

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="fld"><span className="fl">{label}{hint && <em>{hint}</em>}</span>{children}</label>
);

export function PartnerForm({ existing, onClose, onSaved }: { existing?: Relationship; onClose: () => void; onSaved: () => void }) {
  const [rel, setRel] = useState<Relationship>(() => existing ? structuredClone(existing) : blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const maps = useAsync(() => api.partnerMaps());
  const specs = useAsync(() => api.specs());
  const connectors = useAsync(() => api.connectors());
  const isEdit = !!existing;

  const set = (patch: Partial<Relationship>) => setRel((r) => ({ ...r, ...patch }));
  const setEnv = (patch: Partial<Relationship['envelope']>) => setRel((r) => ({ ...r, envelope: { ...r.envelope, ...patch } }));
  const setDoc = (i: number, patch: Partial<RelationshipDoc>) =>
    setRel((r) => ({ ...r, documents: r.documents.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const addDoc = () => setRel((r) => ({ ...r, documents: [...r.documents, blankDoc()] }));
  const rmDoc = (i: number) => setRel((r) => ({ ...r, documents: r.documents.filter((_, j) => j !== i) }));

  const problems: string[] = [];
  if (!rel.partnerId.trim()) problems.push('Partner ID is required.');
  if (!rel.envelope.senderId.trim() || !rel.envelope.receiverId.trim()) problems.push('Sender and receiver IDs are required.');
  rel.documents.forEach((d, i) => { if (!d.mapId.trim()) problems.push(`Flow ${i + 1} (${d.docType}) needs a map.`); });

  const save = async () => {
    if (problems.length) { setErr(problems[0]); return; }
    setSaving(true); setErr(null);
    // Prune empty optional refs; usage indicator tracks mode (T=test, P=prod).
    const clean: Relationship = {
      ...rel,
      partnerName: rel.partnerName?.trim() || undefined,
      envelope: { ...rel.envelope, usageIndicator: rel.mode === 'prod' ? 'P' : 'T' },
      documents: rel.documents.map((d) => ({
        ...d, specId: d.specId?.trim() || undefined, connectorInstanceId: d.connectorInstanceId?.trim() || undefined,
      })),
    };
    const id = isEdit ? rel.id : (crypto.randomUUID?.() ?? `rel_${Date.now()}`);
    try {
      await api.saveRelationship(id, clean);
      onSaved();
    } catch (e) { setErr((e as Error).message); setSaving(false); }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div><div className="crumb">{isEdit ? 'Edit relationship' : 'New relationship'}</div><h2>{rel.partnerName || rel.partnerId || 'Trading partner'}</h2></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-b">
          <section>
            <h3 className="sec">Identity</h3>
            <div className="frow">
              <Field label="Partner ID" hint="ISA/GS partner code"><input value={rel.partnerId} onChange={(e) => set({ partnerId: e.target.value })} placeholder="ACME" disabled={isEdit} /></Field>
              <Field label="Partner name" hint="display"><input value={rel.partnerName ?? ''} onChange={(e) => set({ partnerName: e.target.value })} placeholder="Acme Distribution" /></Field>
            </div>
            <div className="frow">
              <Field label="Our role"><select value={rel.tenantRole} onChange={(e) => set({ tenantRole: e.target.value })}><option value="buyer">Buyer</option><option value="supplier">Supplier</option></select></Field>
              <Field label="Format authority" hint="whose spec governs"><select value={rel.formatAuthority} onChange={(e) => set({ formatAuthority: e.target.value })}><option value="partner">Partner</option><option value="client">Us</option></select></Field>
              <Field label="Version"><input value={rel.version} onChange={(e) => set({ version: e.target.value })} className="mono" /></Field>
              <Field label="Mode"><select value={rel.mode} onChange={(e) => set({ mode: e.target.value })}><option value="test">Test</option><option value="prod">Prod</option></select></Field>
            </div>
          </section>

          <section>
            <h3 className="sec">Envelope <span className="sec-note">ISA/GS identifiers exchanged with the partner</span></h3>
            <div className="frow">
              <Field label="Sender qualifier"><input value={rel.envelope.senderQualifier} onChange={(e) => setEnv({ senderQualifier: e.target.value })} className="mono qual" maxLength={2} /></Field>
              <Field label="Sender ID"><input value={rel.envelope.senderId} onChange={(e) => setEnv({ senderId: e.target.value })} className="mono" placeholder="our ISA06" /></Field>
              <Field label="Receiver qualifier"><input value={rel.envelope.receiverQualifier} onChange={(e) => setEnv({ receiverQualifier: e.target.value })} className="mono qual" maxLength={2} /></Field>
              <Field label="Receiver ID"><input value={rel.envelope.receiverId} onChange={(e) => setEnv({ receiverId: e.target.value })} className="mono" placeholder="partner ISA08" /></Field>
            </div>
            <div className="frow">
              <Field label="GS version" hint="GS08"><input value={rel.envelope.gsVersion} onChange={(e) => setEnv({ gsVersion: e.target.value })} className="mono" /></Field>
            </div>
          </section>

          <section>
            <div className="sec-hd"><h3 className="sec">Document flows</h3><button className="btn btn-sm" onClick={addDoc}>+ Add flow</button></div>
            {rel.documents.length === 0 && <div className="sub" style={{ padding: '8px 0' }}>No flows yet — a relationship needs at least one.</div>}
            {rel.documents.map((d, i) => (
              <div className="flowrow" key={i}>
                <select value={d.docType} onChange={(e) => setDoc(i, { docType: e.target.value })}>{DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <select value={d.direction} onChange={(e) => setDoc(i, { direction: e.target.value })}><option value="inbound">inbound ◂</option><option value="outbound">outbound ▸</option></select>
                <input list="maps-list" value={d.mapId} onChange={(e) => setDoc(i, { mapId: e.target.value })} placeholder="map id" className="mono grow" />
                <input list="specs-list" value={d.specId ?? ''} onChange={(e) => setDoc(i, { specId: e.target.value })} placeholder="spec (optional)" className="mono grow" />
                <input list="conn-list" value={d.connectorInstanceId ?? ''} onChange={(e) => setDoc(i, { connectorInstanceId: e.target.value })} placeholder="connector (optional)" className="mono grow" />
                <label className="chk" title="enabled"><input type="checkbox" checked={d.enabled} onChange={(e) => setDoc(i, { enabled: e.target.checked })} /></label>
                <button className="btn btn-ghost btn-sm" onClick={() => rmDoc(i)} title="remove">✕</button>
              </div>
            ))}
            <datalist id="maps-list">{(maps.data ?? []).map((m: MapRef) => <option key={m.id} value={m.id}>{m.map.docType}/{m.map.direction}</option>)}</datalist>
            <datalist id="specs-list">{(specs.data ?? []).map((s: SpecRef) => <option key={s.id} value={s.id}>{s.spec.name ?? s.spec.docType}</option>)}</datalist>
            <datalist id="conn-list">{(connectors.data ?? []).map((c: ConnectorInstanceRef) => <option key={c.id} value={c.id}>{c.connectorType}</option>)}</datalist>
          </section>

          <label className="chk-row"><input type="checkbox" checked={rel.active} onChange={(e) => set({ active: e.target.checked })} /> Active — process documents for this relationship</label>
        </div>

        <div className="drawer-f">
          {err && <div className="ferr">⚠ {err}</div>}
          {!err && problems.length > 0 && <div className="fhint">{problems.length} thing{problems.length > 1 ? 's' : ''} to complete</div>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || problems.length > 0} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create relationship'}</button>
        </div>
      </div>
    </div>
  );
}
