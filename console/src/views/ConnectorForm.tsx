import { useState } from 'react';
import { api, ConnectorInstance, ConnectorFieldMap } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';

const DOC_TYPES = ['850', '855', '856', '810', '846', '997'];

// View/edit an existing connector instance (Create is the Import-sample wizard). Read-only in 'view'
// mode; 'edit' mode persists via PUT. The connector map's field bindings are editable as tables.
export function ConnectorForm({ id, mode, onClose, onSaved }: { id: string; mode: 'view' | 'edit'; onClose: () => void; onSaved: () => void }) {
  const loaded = useAsync(() => api.connector(id), [id]);
  const [inst, setInst] = useState<ConnectorInstance | null>(null);
  const [editing, setEditing] = useState(mode === 'edit');
  const [settingsText, setSettingsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // seed local state once the instance loads
  if (loaded.data && !inst) { setInst(structuredClone(loaded.data)); setSettingsText(JSON.stringify(loaded.data.settings ?? {}, null, 2)); }
  if (loaded.loading || !inst) {
    return <div className="scrim" onClick={onClose}><div className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-b">{loaded.error ? <ErrorBox msg={loaded.error} /> : <Loading />}</div></div></div>;
  }

  const ro = !editing;
  const map = inst.connectorMap;
  const setMap = (patch: Partial<typeof map>) => setInst({ ...inst, connectorMap: { ...map, ...patch } });
  const setRow = (kind: 'header' | 'lineFields', i: number, patch: Partial<ConnectorFieldMap>) => {
    const rows = [...(map[kind] ?? [])]; rows[i] = { ...rows[i], ...patch }; setMap({ [kind]: rows } as Partial<typeof map>);
  };
  const addRow = (kind: 'header' | 'lineFields') => setMap({ [kind]: [...(map[kind] ?? []), { to: '', from: '' }] } as Partial<typeof map>);
  const rmRow = (kind: 'header' | 'lineFields', i: number) => setMap({ [kind]: (map[kind] ?? []).filter((_, j) => j !== i) } as Partial<typeof map>);

  const save = async () => {
    setSaving(true); setErr(null);
    let settings: Record<string, unknown>;
    try { settings = JSON.parse(settingsText || '{}'); } catch { setErr('Settings must be valid JSON.'); setSaving(false); return; }
    try { await api.saveConnector(inst.id, { ...inst, settings }); onSaved(); }
    catch (e) { setErr((e as Error).message); setSaving(false); }
  };

  const Rows = ({ kind, title }: { kind: 'header' | 'lineFields'; title: string }) => (
    <div style={{ marginTop: 12 }}>
      <div className="sec-hd"><h3 className="sec">{title}</h3>{!ro && <button className="btn btn-sm" onClick={() => addRow(kind)}>+ field</button>}</div>
      <div className="eltable">
        <div className="elh" style={{ gridTemplateColumns: '1.4fr 1.4fr 70px 34px' }}><span>Canonical (to)</span><span>Source (from)</span><span>Decimal</span><span /></div>
        {(map[kind] ?? []).map((f, i) => (
          <div className="elr" key={i} style={{ gridTemplateColumns: '1.4fr 1.4fr 70px 34px' }}>
            <input className="mono" value={f.to} disabled={ro} onChange={(e) => setRow(kind, i, { to: e.target.value })} />
            <input className="mono" value={f.from ?? ''} disabled={ro} onChange={(e) => setRow(kind, i, { from: e.target.value })} />
            <input inputMode="numeric" value={f.decimal ?? ''} disabled={ro} onChange={(e) => setRow(kind, i, { decimal: e.target.value === '' ? undefined : Number(e.target.value) })} />
            {!ro ? <button className="btn btn-ghost btn-sm" onClick={() => rmRow(kind, i)}>✕</button> : <span />}
          </div>
        ))}
        {(map[kind] ?? []).length === 0 && <div className="sub" style={{ padding: '4px 2px' }}>none</div>}
      </div>
    </div>
  );

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div><div className="crumb">{ro ? 'Connector' : 'Edit connector'}</div><h2>{inst.id}</h2></div>
          {ro && <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-b">
          <section>
            <h3 className="sec">Instance</h3>
            <div className="frow">
              <label className="fld"><span className="fl">Type</span><input value={inst.connectorType} disabled /></label>
              <label className="fld"><span className="fl">Trigger</span><select value={inst.trigger} disabled={ro} onChange={(e) => setInst({ ...inst, trigger: e.target.value })}>{['manual', 'file-drop', 'poll', 'webhook'].map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="fld"><span className="fl">Doc types</span><input className="mono" value={inst.docTypes.join(', ')} disabled /></label>
            </div>
            <label className="fld"><span className="fl">Settings (JSON)</span><textarea className="sample json" style={{ minHeight: 90 }} value={settingsText} disabled={ro} onChange={(e) => setSettingsText(e.target.value)} spellCheck={false} /></label>
          </section>
          <section>
            <h3 className="sec">Connector map <span className="sec-note">native ⇄ canonical bindings</span></h3>
            <div className="frow">
              <label className="fld"><span className="fl">Doc type</span><select value={map.docType} disabled={ro} onChange={(e) => setMap({ docType: e.target.value })}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></label>
              <label className="fld"><span className="fl">Direction</span><select value={map.direction} disabled={ro} onChange={(e) => setMap({ direction: e.target.value })}><option value="inbound">inbound</option><option value="outbound">outbound</option></select></label>
              <label className="fld"><span className="fl">Line array (lineTo)</span><input className="mono" value={map.lineTo ?? ''} disabled={ro} onChange={(e) => setMap({ lineTo: e.target.value || undefined })} placeholder="lines" /></label>
              <label className="fld"><span className="fl">Source array (lineOver)</span><input className="mono" value={map.lineOver ?? ''} disabled={ro} onChange={(e) => setMap({ lineOver: e.target.value || undefined })} placeholder="line_items" /></label>
            </div>
            <Rows kind="header" title="Header fields" />
            <Rows kind="lineFields" title="Line fields" />
          </section>
        </div>
        <div className="drawer-f">
          {err && <div className="ferr">⚠ {err}</div>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>{ro ? 'Close' : 'Cancel'}</button>
          {!ro && <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>}
        </div>
      </div>
    </div>
  );
}
