import { useState } from 'react';
import { api, DocSpec, SegmentSpec, ElementSpec } from '../api';

const DOC_TYPES = ['850', '855', '856', '810', '846', '997'];
const REQ = ['mandatory', 'optional', 'conditional'];
const ETYPES = ['', 'AN', 'N', 'R', 'ID', 'DT', 'TM'];

const blankEl = (pos: number): ElementSpec => ({ pos, requirement: 'optional' });
const blankSeg = (): SegmentSpec => ({ tag: '', requirement: 'optional', elements: [blankEl(1)] });
const blank = (): DocSpec => ({ docType: '850', version: '004010', owner: 'client', name: '', segments: [blankSeg()] });

export function SpecForm({ existingId, onClose, onSaved }: { existingId?: string; onClose: () => void; onSaved: () => void }) {
  const [spec, setSpec] = useState<DocSpec | null>(existingId ? null : blank());
  const [id, setId] = useState(existingId ?? '');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!existingId;

  // Lazy-load an existing spec on first render.
  if (isEdit && !spec && !loadErr) {
    api.spec(existingId!).then((s) => setSpec(structuredClone(s))).catch((e) => setLoadErr((e as Error).message));
    return <div className="scrim" onClick={onClose}><div className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-b"><div className="loading">Loading spec…</div></div></div></div>;
  }
  if (loadErr) return <div className="scrim" onClick={onClose}><div className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-b"><div className="error">⚠ {loadErr}</div></div></div></div>;
  if (!spec) return null;

  const set = (patch: Partial<DocSpec>) => setSpec((s) => ({ ...s!, ...patch }));
  const setSeg = (i: number, patch: Partial<SegmentSpec>) => setSpec((s) => ({ ...s!, segments: s!.segments.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const setEl = (si: number, ei: number, patch: Partial<ElementSpec>) =>
    setSpec((s) => ({ ...s!, segments: s!.segments.map((g, j) => j !== si ? g : { ...g, elements: g.elements.map((e, k) => (k === ei ? { ...e, ...patch } : e)) }) }));
  const addSeg = () => setSpec((s) => ({ ...s!, segments: [...s!.segments, blankSeg()] }));
  const rmSeg = (i: number) => setSpec((s) => ({ ...s!, segments: s!.segments.filter((_, j) => j !== i) }));
  const addEl = (si: number) => setSpec((s) => ({ ...s!, segments: s!.segments.map((g, j) => j !== si ? g : { ...g, elements: [...g.elements, blankEl(g.elements.length + 1)] }) }));
  const rmEl = (si: number, ei: number) => setSpec((s) => ({ ...s!, segments: s!.segments.map((g, j) => j !== si ? g : { ...g, elements: g.elements.filter((_, k) => k !== ei) }) }));

  const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
  const problems: string[] = [];
  if (!id.trim()) problems.push('Spec id is required.');
  spec.segments.forEach((g, i) => { if (!g.tag.trim()) problems.push(`Segment ${i + 1} needs a tag.`); });

  const save = async () => {
    if (problems.length) { setErr(problems[0]); return; }
    setSaving(true); setErr(null);
    const clean: DocSpec = {
      ...spec, name: spec.name?.trim() || undefined,
      segments: spec.segments.map((g) => ({
        ...g, name: g.name?.trim() || undefined, maxUse: g.maxUse,
        elements: g.elements.map((e) => ({ ...e, name: e.name?.trim() || undefined, type: e.type || undefined, codes: e.codes?.length ? e.codes : undefined })),
      })),
    };
    try { await api.saveSpec(id.trim(), clean); onSaved(); }
    catch (e) { setErr((e as Error).message); setSaving(false); }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div><div className="crumb">{isEdit ? 'Edit spec' : 'New conformance spec'}</div><h2>{spec.name || `${spec.docType} spec`}</h2></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-b">
          <section>
            <h3 className="sec">Spec header</h3>
            <div className="frow">
              <label className="fld"><span className="fl">Spec id</span><input className="mono" value={id} onChange={(e) => setId(e.target.value)} disabled={isEdit} placeholder="house-850" /></label>
              <label className="fld"><span className="fl">Name</span><input value={spec.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="House 850" /></label>
              <label className="fld"><span className="fl">Doc type</span><select value={spec.docType} onChange={(e) => set({ docType: e.target.value })}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></label>
              <label className="fld"><span className="fl">Version</span><input className="mono" value={spec.version} onChange={(e) => set({ version: e.target.value })} /></label>
              <label className="fld"><span className="fl">Owner</span><select value={spec.owner} onChange={(e) => set({ owner: e.target.value })}><option value="client">Client (house)</option><option value="partner">Partner (IG)</option></select></label>
            </div>
          </section>

          <section>
            <div className="sec-hd"><h3 className="sec">Segments <span className="sec-note">required segments, cardinality, per-element rules</span></h3><button className="btn btn-sm" onClick={addSeg}>+ Segment</button></div>
            {spec.segments.map((g, si) => (
              <div className="segcard" key={si}>
                <div className="seghd">
                  <input className="mono seg-tag" value={g.tag} onChange={(e) => setSeg(si, { tag: e.target.value.toUpperCase() })} placeholder="TAG" maxLength={3} />
                  <input className="seg-name" value={g.name ?? ''} onChange={(e) => setSeg(si, { name: e.target.value })} placeholder="segment name" />
                  <select value={g.requirement} onChange={(e) => setSeg(si, { requirement: e.target.value })}>{REQ.map((r) => <option key={r}>{r}</option>)}</select>
                  <input className="seg-max" inputMode="numeric" value={g.maxUse ?? ''} onChange={(e) => setSeg(si, { maxUse: num(e.target.value) })} placeholder="maxUse" title="max occurrences (blank = unbounded)" />
                  <button className="btn btn-ghost btn-sm" onClick={() => rmSeg(si)} title="remove segment">✕</button>
                </div>
                <div className="eltable">
                  <div className="elh"><span>Pos</span><span>Name</span><span>Req</span><span>Type</span><span>Min</span><span>Max</span><span>Codes (comma)</span><span /></div>
                  {g.elements.map((el, ei) => (
                    <div className="elr" key={ei}>
                      <input inputMode="numeric" value={el.pos} onChange={(e) => setEl(si, ei, { pos: Number(e.target.value) || 0 })} />
                      <input value={el.name ?? ''} onChange={(e) => setEl(si, ei, { name: e.target.value })} placeholder="element" />
                      <select value={el.requirement} onChange={(e) => setEl(si, ei, { requirement: e.target.value })}>{REQ.map((r) => <option key={r} value={r}>{r[0].toUpperCase()}</option>)}</select>
                      <select value={el.type ?? ''} onChange={(e) => setEl(si, ei, { type: e.target.value })}>{ETYPES.map((t) => <option key={t} value={t}>{t || '—'}</option>)}</select>
                      <input inputMode="numeric" value={el.min ?? ''} onChange={(e) => setEl(si, ei, { min: num(e.target.value) })} />
                      <input inputMode="numeric" value={el.max ?? ''} onChange={(e) => setEl(si, ei, { max: num(e.target.value) })} />
                      <input className="mono" value={(el.codes ?? []).join(',')} onChange={(e) => setEl(si, ei, { codes: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })} placeholder="ID codes" />
                      <button className="btn btn-ghost btn-sm" onClick={() => rmEl(si, ei)} title="remove">✕</button>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm addel" onClick={() => addEl(si)}>+ element</button>
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="drawer-f">
          {err && <div className="ferr">⚠ {err}</div>}
          {!err && problems.length > 0 && <div className="fhint">{problems.length} to complete</div>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || problems.length > 0} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create spec'}</button>
        </div>
      </div>
    </div>
  );
}
