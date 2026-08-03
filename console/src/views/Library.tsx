import { useState } from 'react';
import { api, MapRef, SpecRef } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';
import { MapForm } from './MapForm';
import { SpecForm } from './SpecForm';

type MapState = { mode: 'new' } | { mode: 'edit'; id: string } | null;
type SpecState = { mode: 'new' } | { mode: 'edit'; id: string } | null;

export function Library() {
  const maps = useAsync(() => api.partnerMaps());
  const specs = useAsync(() => api.specs());
  const [mapForm, setMapForm] = useState<MapState>(null);
  const [specForm, setSpecForm] = useState<SpecState>(null);

  if (maps.loading || specs.loading) return <Loading />;
  if (maps.error) return <ErrorBox msg={maps.error} />;
  if (specs.error) return <ErrorBox msg={specs.error} />;
  const ml = maps.data ?? [];
  const sl = specs.data ?? [];

  return (
    <div className="view">
      <p className="intro">The authored artifacts a relationship references: <b>maps</b> translate X12 ⇄ canonical; <b>specs</b> define what a conformant document must contain. These are the deepest config — edit with care.</p>

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-h"><h3>Partner maps</h3><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setMapForm({ mode: 'new' })}>+ New map</button></div>
        {ml.length === 0
          ? <div className="empty">No maps yet. <br />A map is the X12 ⇄ canonical DSL a document flow runs through.</div>
          : <table>
              <thead><tr><th>Map id</th><th>Partner</th><th>Doc type</th><th>Direction</th></tr></thead>
              <tbody>{ml.map((m: MapRef) => (
                <tr key={m.id} className="click" onClick={() => setMapForm({ mode: 'edit', id: m.id })}>
                  <td className="mono">{m.id}</td><td>{m.map.partner}</td><td><span className="tag">{m.map.docType}</span></td>
                  <td className="sub">{m.map.direction === 'inbound' ? 'inbound ◂' : 'outbound ▸'}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Conformance specs</h3><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setSpecForm({ mode: 'new' })}>+ New spec</button></div>
        {sl.length === 0
          ? <div className="empty">No specs yet. <br />A spec defines required segments and element rules a document is validated against.</div>
          : <table>
              <thead><tr><th>Spec id</th><th>Name</th><th>Doc type</th><th>Owner</th></tr></thead>
              <tbody>{sl.map((s: SpecRef) => (
                <tr key={s.id} className="click" onClick={() => setSpecForm({ mode: 'edit', id: s.id })}>
                  <td className="mono">{s.id}</td><td>{s.spec.name ?? '—'}</td><td><span className="tag">{s.spec.docType}</span></td>
                  <td className="sub">{s.spec.owner}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      {mapForm?.mode === 'new' && <MapForm onClose={() => setMapForm(null)} onSaved={() => { setMapForm(null); maps.reload(); }} />}
      {mapForm?.mode === 'edit' && <MapForm existingId={mapForm.id} onClose={() => setMapForm(null)} onSaved={() => { setMapForm(null); maps.reload(); }} />}
      {specForm?.mode === 'new' && <SpecForm onClose={() => setSpecForm(null)} onSaved={() => { setSpecForm(null); specs.reload(); }} />}
      {specForm?.mode === 'edit' && <SpecForm existingId={specForm.id} onClose={() => setSpecForm(null)} onSaved={() => { setSpecForm(null); specs.reload(); }} />}
    </div>
  );
}
