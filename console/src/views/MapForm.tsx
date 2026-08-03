import { useMemo, useState } from 'react';
import { api, EdiMap } from '../api';

const DOC_TYPES = ['850', '855', '856', '810', '846', '997'];

// A realistic minimal scaffold so the author sees the DSL shape — a starting point, not a finished map.
const template = (docType: string, direction: string): unknown[] => {
  const head = docType === '810'
    ? { segment: 'BIG', elements: [{ pos: 1, path: 'invoiceDate', format: 'CCYYMMDD' }, { pos: 2, path: 'invoiceNumber' }] }
    : { segment: 'BEG', elements: [{ pos: 1, const: '00' }, { pos: 2, const: 'SA' }, { pos: 3, path: 'poNumber' }, { pos: 5, path: 'poDate', format: 'CCYYMMDD' }] };
  const lineSeg = docType === '810' ? 'IT1' : 'PO1';
  const line = {
    loop: lineSeg, over: 'lines',
    segments: [{ segment: lineSeg, elements: [{ pos: 1, path: 'lineNumber' }, { pos: 2, path: 'quantity.value' }, { pos: 4, path: 'unitPrice.amount', decimal: 2 }, { pos: 7, path: 'sku' }] }],
  };
  return direction === 'inbound'
    ? [{ ...head, $comment: 'inbound: elements read X12 → canonical via the same paths' }, line]
    : [head, line];
};

interface Outline { depth: number; label: string; note?: string }
function outline(nodes: unknown[], depth = 0, acc: Outline[] = []): Outline[] {
  for (const n of nodes) {
    const node = n as Record<string, unknown>;
    if (typeof node.segment === 'string') acc.push({ depth, label: `▪ ${node.segment}`, note: `${(node.elements as unknown[] | undefined)?.length ?? 0} el${node.over ? ` · over ${node.over}` : ''}` });
    else if (typeof node.loop === 'string') { acc.push({ depth, label: `▸ loop ${node.loop}`, note: node.over ? `over ${node.over}` : undefined }); outline((node.segments as unknown[]) ?? [], depth + 1, acc); }
    else acc.push({ depth, label: '⚠ unknown node', note: 'needs "segment" or "loop"' });
  }
  return acc;
}

function validate(text: string): { ok: true; nodes: unknown[] } | { ok: false; msg: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) { return { ok: false, msg: `JSON: ${(e as Error).message}` }; }
  if (!Array.isArray(parsed)) return { ok: false, msg: 'structure must be a JSON array of nodes.' };
  const bad = (parsed as Record<string, unknown>[]).findIndex((n) => !n || (typeof n.segment !== 'string' && typeof n.loop !== 'string'));
  if (bad >= 0) return { ok: false, msg: `node ${bad + 1} needs a "segment" or "loop" key.` };
  return { ok: true, nodes: parsed };
}

export function MapForm({ existingId, onClose, onSaved }: { existingId?: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existingId;
  const [id, setId] = useState(existingId ?? '');
  const [meta, setMeta] = useState({ partner: '', docType: '850', direction: 'outbound', functionalId: '', version: '004010' });
  const [text, setText] = useState('');
  const [ready, setReady] = useState(!isEdit);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy-load an existing map into the editor once.
  if (isEdit && !ready && !loadErr) {
    api.partnerMap(existingId!).then((m) => {
      setMeta({ partner: m.partner ?? '', docType: m.docType ?? '850', direction: m.direction ?? 'outbound', functionalId: m.functionalId ?? '', version: m.version ?? '004010' });
      setText(JSON.stringify(m.structure ?? [], null, 2)); setReady(true);
    }).catch((e) => setLoadErr((e as Error).message));
  }

  const check = useMemo(() => validate(text || '[]'), [text]);
  const nodes = check.ok ? check.nodes : [];

  const insertTemplate = () => setText(JSON.stringify(template(meta.docType, meta.direction), null, 2));
  const format = () => { if (check.ok) setText(JSON.stringify(nodes, null, 2)); };

  const problems: string[] = [];
  if (!id.trim()) problems.push('Map id is required.');
  if (!meta.partner.trim()) problems.push('Partner is required.');
  if (!check.ok) problems.push(check.msg);

  const save = async () => {
    if (problems.length) { setErr(problems[0]); return; }
    setSaving(true); setErr(null);
    const map: EdiMap = {
      partner: meta.partner.trim(), docType: meta.docType, direction: meta.direction,
      functionalId: meta.functionalId.trim() || undefined, version: meta.version.trim() || undefined, structure: nodes,
    };
    try { await api.saveMap(id.trim(), map); onSaved(); }
    catch (e) { setErr((e as Error).message); setSaving(false); }
  };

  if (loadErr) return <div className="scrim" onClick={onClose}><div className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-b"><div className="error">⚠ {loadErr}</div></div></div></div>;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div><div className="crumb">{isEdit ? 'Edit partner map' : 'New partner map'}</div><h2>{meta.partner || 'Partner'} · {meta.docType} {meta.direction === 'inbound' ? '◂' : '▸'}</h2></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-b">
          <section>
            <h3 className="sec">Map header</h3>
            <div className="frow">
              <label className="fld"><span className="fl">Map id</span><input className="mono" value={id} onChange={(e) => setId(e.target.value)} disabled={isEdit} placeholder="acme-850-out" /></label>
              <label className="fld"><span className="fl">Partner</span><input value={meta.partner} onChange={(e) => setMeta({ ...meta, partner: e.target.value })} placeholder="ACME" /></label>
              <label className="fld"><span className="fl">Doc type</span><select value={meta.docType} onChange={(e) => setMeta({ ...meta, docType: e.target.value })}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></label>
              <label className="fld"><span className="fl">Direction</span><select value={meta.direction} onChange={(e) => setMeta({ ...meta, direction: e.target.value })}><option value="outbound">outbound ▸</option><option value="inbound">inbound ◂</option></select></label>
              <label className="fld"><span className="fl">Functional id</span><input className="mono" value={meta.functionalId} onChange={(e) => setMeta({ ...meta, functionalId: e.target.value })} placeholder="PO" /></label>
              <label className="fld"><span className="fl">Version</span><input className="mono" value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} /></label>
            </div>
          </section>

          <section>
            <div className="sec-hd">
              <h3 className="sec">Structure <span className="sec-note">the X12 ⇄ canonical node tree — authored as JSON</span></h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={insertTemplate} title="replace with a starter scaffold">Insert template</button>
                <button className="btn btn-sm btn-ghost" onClick={format} disabled={!check.ok}>Format</button>
              </div>
            </div>
            <p className="sub" style={{ margin: '0 0 10px' }}>X12 maps are code-like (loops, qualifiers, formats). This is a structured JSON editor validated against the DSL — not a lossy visual canvas. Each node is a <span className="mono">segment</span> or a <span className="mono">loop</span> with nested segments.</p>
            <div className="mapedit">
              <textarea className="sample json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={'[\n  { "segment": "BEG", "elements": [ { "pos": 3, "path": "poNumber" } ] }\n]'} />
              <div className="outline">
                <div className="ol-h">{check.ok ? `${nodes.length} node${nodes.length === 1 ? '' : 's'}` : 'invalid'}</div>
                {check.ok
                  ? outline(nodes).map((o, i) => <div className="ol-r" key={i} style={{ paddingLeft: 10 + o.depth * 14 }}><span>{o.label}</span>{o.note && <em>{o.note}</em>}</div>)
                  : <div className="ol-bad">⚠ {check.msg}</div>}
              </div>
            </div>
          </section>
        </div>

        <div className="drawer-f">
          {err && <div className="ferr">⚠ {err}</div>}
          {!err && problems.length > 0 && <div className="fhint">{problems[0]}</div>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || problems.length > 0} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create map'}</button>
        </div>
      </div>
    </div>
  );
}
