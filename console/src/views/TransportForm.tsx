import { useState } from 'react';
import { api, TransportInstance } from '../api';

const TYPES = ['sftp', 'webhook'];

// Per-type config fields. Secrets are NEVER entered here — they resolve from the vault via vaultRef.
const SETTINGS: Record<string, Array<{ key: string; label: string; hint?: string; required?: boolean; number?: boolean; placeholder?: string }>> = {
  sftp: [
    { key: 'host', label: 'Host', required: true, placeholder: 'sftp.partner.com' },
    { key: 'port', label: 'Port', hint: 'default 22', number: true, placeholder: '22' },
    { key: 'username', label: 'Username', required: true, placeholder: 'edi' },
    { key: 'inboundPath', label: 'Inbound path', hint: 'list+get on pull', placeholder: '/in' },
    { key: 'outboundPath', label: 'Outbound path', hint: 'put on push', placeholder: '/out' },
    { key: 'pattern', label: 'File pattern', hint: 'glob', placeholder: '*.csv' },
  ],
  webhook: [
    { key: 'url', label: 'Outbound URL', hint: 'partner endpoint we POST to', placeholder: 'https://partner.example.com/edi' },
    { key: 'signatureScheme', label: 'Signature scheme', hint: 'inbound verify', placeholder: 'hmac-sha256' },
    { key: 'signatureHeader', label: 'Signature header', hint: 'inbound', placeholder: 'X-Hub-Signature-256' },
  ],
};

const blank = (): TransportInstance => ({ id: '', tenantId: '', transportType: 'sftp', settings: {}, vaultRef: '', direction: 'both' });

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="fld"><span className="fl">{label}{hint && <em>{hint}</em>}</span>{children}</label>
);

export function TransportForm({ existing, onClose, onSaved }: { existing?: TransportInstance; onClose: () => void; onSaved: () => void }) {
  const [tp, setTp] = useState<TransportInstance>(() => existing ? structuredClone(existing) : blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!existing;
  const fields = SETTINGS[tp.transportType] ?? [];

  const set = (patch: Partial<TransportInstance>) => setTp((t) => ({ ...t, ...patch }));
  const setSetting = (key: string, val: string, number?: boolean) =>
    setTp((t) => {
      const settings = { ...t.settings };
      if (!val.trim()) delete settings[key];
      else settings[key] = number ? Number(val) : val;
      return { ...t, settings };
    });

  const problems: string[] = [];
  if (!tp.id.trim() && isEdit) problems.push('Transport id is required.');
  fields.filter((f) => f.required).forEach((f) => { if (!String(tp.settings[f.key] ?? '').trim()) problems.push(`${f.label} is required.`); });

  const save = async () => {
    if (problems.length) { setErr(problems[0]); return; }
    setSaving(true); setErr(null);
    const clean: TransportInstance = { ...tp, vaultRef: tp.vaultRef?.trim() || undefined };
    const id = isEdit ? tp.id : (crypto.randomUUID?.() ?? `tp_${Date.now()}`);
    try { await api.saveTransport(id, clean); onSaved(); }
    catch (e) { setErr((e as Error).message); setSaving(false); }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div><div className="crumb">{isEdit ? 'Edit transport' : 'New transport'}</div><h2>{tp.transportType.toUpperCase()} endpoint</h2></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-b">
          <section>
            <h3 className="sec">Endpoint</h3>
            <div className="frow">
              <Field label="Transport type"><select value={tp.transportType} disabled={isEdit} onChange={(e) => set({ transportType: e.target.value, settings: {} })}>{TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></Field>
              <Field label="Direction"><select value={tp.direction} onChange={(e) => set({ direction: e.target.value })}><option value="both">Both</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></Field>
              {isEdit && <Field label="Transport id"><input className="mono" value={tp.id} disabled /></Field>}
            </div>
          </section>

          <section>
            <h3 className="sec">Configuration <span className="sec-note">non-secret settings only</span></h3>
            <div className="frow">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input value={String(tp.settings[f.key] ?? '')} onChange={(e) => setSetting(f.key, e.target.value, f.number)}
                    placeholder={f.placeholder} inputMode={f.number ? 'numeric' : undefined} className={f.key === 'host' || f.key === 'url' ? 'mono' : ''} />
                </Field>
              ))}
            </div>
          </section>

          <section>
            <h3 className="sec">Credentials</h3>
            <Field label="Vault reference" hint="pointer, not the secret"><input className="mono" value={tp.vaultRef ?? ''} onChange={(e) => set({ vaultRef: e.target.value })} placeholder="vault://sftp/acme" /></Field>
            <p className="sub" style={{ marginTop: 8 }}>Passwords and keys are never entered or stored here — this points at the secret held in the vault. Live pull/push stay disabled until a credentialed environment resolves it.</p>
          </section>
        </div>

        <div className="drawer-f">
          {err && <div className="ferr">⚠ {err}</div>}
          {!err && problems.length > 0 && <div className="fhint">{problems.length} thing{problems.length > 1 ? 's' : ''} to complete</div>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || problems.length > 0} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create transport'}</button>
        </div>
      </div>
    </div>
  );
}
