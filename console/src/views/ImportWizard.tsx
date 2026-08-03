import { useState } from 'react';
import { api, SampleProfile, ConnectorFieldMap, ConnectorMap, ConnectorInstance } from '../api';

const DOC_TYPES = ['850', '855', '856', '810', '846'];
const CONNECTOR_TYPES = ['csv', 'xlsx', 'generic-rest', 'database', 'shopify', 'amazon', 'quickbooks'];
const TRIGGERS = ['manual', 'file-drop', 'poll', 'webhook'];

// Canonical targets offered in the datalist per doc type (mirrors the server profiler's CANON).
const TARGETS: Record<string, string[]> = {
  '850': ['poNumber', 'poDate', 'lines[].sku', 'lines[].quantity.value', 'lines[].unitPrice.amount'],
  '810': ['invoiceNumber', 'invoiceDate', 'totalAmount', 'lines[].sku', 'lines[].quantity.value', 'lines[].unitPrice.amount'],
};
TARGETS['855'] = TARGETS['856'] = TARGETS['846'] = TARGETS['850'];

// A canonical target coerced to a number: amounts → 2 dp, quantities → 0 dp. Others stay strings.
const decimalFor = (target: string): number | undefined =>
  /amount|price|total/i.test(target) ? 2 : /quantity/i.test(target) ? 0 : undefined;

interface Row { path: string; sample: string; line: boolean; target: string; skip: boolean; }

/** Turn the reviewed rows into a ConnectorMap. Header rows → header[]; line rows → lineFields[] under
 * lineTo (the canonical array). For JSON, a `src[].field` path also sets lineOver (the source array). */
function buildMap(connectorType: string, docType: string, source: string, rows: Row[]): ConnectorMap {
  const header: ConnectorFieldMap[] = [];
  const lineFields: ConnectorFieldMap[] = [];
  let lineTo: string | undefined;
  let lineOver: string | undefined;
  for (const r of rows) {
    if (r.skip || !r.target.trim()) continue;
    const dec = decimalFor(r.target);
    if (!r.line) { header.push({ to: r.target, from: r.path, ...(dec != null ? { decimal: dec } : {}) }); continue; }
    const tm = r.target.match(/^([^[]+)\[\]\.(.+)$/); // lines[].quantity.value → lines / quantity.value
    if (tm) lineTo = tm[1];
    const relTo = tm ? tm[2] : r.target;
    let from = r.path;
    if (source === 'json') {
      const pm = r.path.match(/^([^[]+)\[\]\.(.+)$/); // items[].sku → lineOver=items, from=sku
      if (pm) { lineOver = pm[1]; from = pm[2]; }
    }
    lineFields.push({ to: relTo, from, ...(dec != null ? { decimal: dec } : {}) });
  }
  const map: ConnectorMap = { connector: connectorType, docType, direction: 'inbound', header };
  if (lineFields.length) { map.lineTo = lineTo ?? 'lines'; map.lineFields = lineFields; if (lineOver) map.lineOver = lineOver; }
  return map;
}

export function ImportWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [connectorType, setConnectorType] = useState('csv');
  const [docType, setDocType] = useState('850');
  const [trigger, setTrigger] = useState('manual');
  const [sample, setSample] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [profile, setProfile] = useState<SampleProfile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const profileNow = async () => {
    setBusy(true); setErr(null);
    try {
      const p = await api.importSample({ type: format, sample, docType });
      setProfile(p);
      setRows(p.fields.map((f) => ({ path: f.path, sample: f.sample, line: f.line, target: f.suggestion?.target ?? '', skip: !f.suggestion })));
      if (!instanceId) setInstanceId(`${connectorType}-${docType}-${Math.abs(hash(sample)).toString(36).slice(0, 5)}`);
      setStep(2);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const mapped = rows.filter((r) => !r.skip && r.target.trim());

  const save = async () => {
    if (!instanceId.trim()) { setErr('Connector id is required.'); return; }
    if (!mapped.length) { setErr('Map at least one field before saving.'); return; }
    setBusy(true); setErr(null);
    const inst: ConnectorInstance = {
      id: instanceId.trim(), tenantId: '', connectorType, settings: {},
      connectorMap: buildMap(connectorType, docType, format, rows), docTypes: [docType], trigger,
    };
    try { await api.saveConnector(inst.id, inst); onSaved(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div><div className="crumb">Import sample → connector</div><h2>{step === 1 ? 'Provide a client sample' : 'Review field mapping'}</h2></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-b">
          <div className="steps">
            <span className={step === 1 ? 'on' : 'done'}>1 · Sample</span>
            <span className={step === 2 ? 'on' : ''}>2 · Mapping</span>
          </div>

          {step === 1 && (
            <>
              <div className="frow">
                <label className="fld"><span className="fl">Connector type</span><select value={connectorType} onChange={(e) => { setConnectorType(e.target.value); }}>{CONNECTOR_TYPES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="fld"><span className="fl">Document type</span><select value={docType} onChange={(e) => setDocType(e.target.value)}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></label>
                <label className="fld"><span className="fl">Format</span><select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}><option value="csv">CSV (rows)</option><option value="json">JSON (API payload)</option></select></label>
                <label className="fld"><span className="fl">Trigger</span><select value={trigger} onChange={(e) => setTrigger(e.target.value)}>{TRIGGERS.map((t) => <option key={t}>{t}</option>)}</select></label>
              </div>
              <label className="fld"><span className="fl">Paste a sample {format === 'csv' ? '— header row + a few data rows' : '— one representative payload'}</span>
                <textarea className="sample" value={sample} onChange={(e) => setSample(e.target.value)} spellCheck={false}
                  placeholder={format === 'csv' ? 'PO Number,SKU,Qty,Price\n4500,A1,10,18.50\n4500,B2,5,44.00' : '{ "orderId": "4500", "items": [{ "sku": "A1", "qty": 10 }] }'} />
              </label>
            </>
          )}

          {step === 2 && profile && (
            <>
              <div className="pstat">
                <div><b>{profile.fields.length}</b> fields</div>
                <div className="ok"><b>{mapped.length}</b> mapped</div>
                <div className="faint"><b>{profile.fields.length - mapped.length}</b> unmapped</div>
                {profile.docCount > 1 && <div className="faint">{profile.docCount} docs · key <span className="mono">{profile.docKey}</span></div>}
              </div>
              <div className="maptable">
                <div className="mh"><span>Source field</span><span>Sample</span><span>Where</span><span>Canonical target</span><span>Skip</span></div>
                {rows.map((r, i) => (
                  <div className={`mr${r.skip ? ' sk' : ''}`} key={i}>
                    <span className="mono">{r.path}</span>
                    <span className="sub mono">{r.sample || '—'}</span>
                    <span><span className={`tag ${r.line ? 't-line' : ''}`}>{r.line ? 'line' : 'header'}</span></span>
                    <input list={`t-${docType}`} className="mono" value={r.target} disabled={r.skip} onChange={(e) => setRow(i, { target: e.target.value })} placeholder="unmapped" />
                    <label className="chk"><input type="checkbox" checked={r.skip} onChange={(e) => setRow(i, { skip: e.target.checked })} /></label>
                  </div>
                ))}
              </div>
              <datalist id={`t-${docType}`}>{(TARGETS[docType] ?? []).map((t) => <option key={t} value={t} />)}</datalist>
              <label className="fld" style={{ maxWidth: 340 }}><span className="fl">Connector id</span><input className="mono" value={instanceId} onChange={(e) => setInstanceId(e.target.value)} /></label>
            </>
          )}
        </div>

        <div className="drawer-f">
          {err && <div className="ferr">⚠ {err}</div>}
          <div className="spacer" />
          {step === 1 && <>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !sample.trim()} onClick={profileNow}>{busy ? 'Profiling…' : 'Profile sample →'}</button>
          </>}
          {step === 2 && <>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" disabled={busy || !mapped.length} onClick={save}>{busy ? 'Saving…' : 'Save connector'}</button>
          </>}
        </div>
      </div>
    </div>
  );
}

// Small stable string hash for a default connector id suffix (no Date.now/random needed for uniqueness here).
function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
