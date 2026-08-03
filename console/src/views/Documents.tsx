import { useState } from 'react';
import { api, DocSummary, StoredTransaction } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox, Pill, kindFor } from '../ui';

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error } = useAsync<StoredTransaction>(() => api.document(id), [id]);
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-h"><h3>Document {id.slice(0, 8)}</h3><div className="spacer" /><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div>
      <div style={{ padding: 16 }}>
        {loading && <Loading />}
        {error && <ErrorBox msg={error} />}
        {data && <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{JSON.stringify(data.canonical, null, 2)}</pre>}
      </div>
    </div>
  );
}

export function Documents() {
  const { data, loading, error } = useAsync(() => api.documents());
  const [open, setOpen] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const rows = data ?? [];
  return (
    <div className="view">
      <p className="intro">Every processed document, from the normalized transaction rows. Click a row for its reconstructed canonical.</p>
      <div className="panel">
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>PO / Ref</th><th>State</th><th>Conformant</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="sub">No documents yet.</td></tr>}
            {rows.map((d: DocSummary) => (
              <tr key={d.id} className="click" onClick={() => setOpen(d.id)}>
                <td className="mono sub">{d.id.slice(0, 8)}</td>
                <td><span className="tag">{d.docType}</span></td>
                <td className="mono">{d.poNumber ?? '—'}</td>
                <td><Pill kind={kindFor(d.currentState)} label={d.currentState} /></td>
                <td className="sub">{d.conformant ? '✓' : '✕'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
