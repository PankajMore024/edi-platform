import { useState } from 'react';
import { api, DocSummary, StoredTransaction } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox, Pill, kindFor } from '../ui';

const DOC_TYPES = ['850', '855', '856', '810', '846', '997'];
const PAGE = 15;

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error } = useAsync<StoredTransaction>(() => api.document(id), [id]);
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panel-h"><h3>Document {id.slice(0, 8)}</h3><div className="spacer" /><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div>
      <div style={{ padding: 16 }}>
        {loading && <Loading />}{error && <ErrorBox msg={error} />}
        {data && <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{JSON.stringify(data.canonical, null, 2)}</pre>}
      </div>
    </div>
  );
}

export function PartnerDocuments({ relationshipId }: { relationshipId: string }) {
  const [doc, setDoc] = useState('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const q = useAsync(
    () => api.documents({ relationshipId, docType: doc === 'all' ? undefined : doc, limit: String(PAGE), offset: String(page * PAGE) }),
    [relationshipId, doc, page],
  );

  const pick = (d: string) => { setDoc(d); setPage(0); setOpen(null); };
  if (q.error) return <ErrorBox msg={q.error} />;
  const rows = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <div className="dpills" style={{ marginBottom: 14 }}>
        <button className={`dpill${doc === 'all' ? ' on' : ''}`} onClick={() => pick('all')}><span className="dp-t">All</span></button>
        {DOC_TYPES.map((d) => <button key={d} className={`dpill${doc === d ? ' on' : ''}`} onClick={() => pick(d)}><span className="dp-dt mono">{d}</span></button>)}
      </div>
      <div className="panel">
        {q.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Document</th><th>Type</th><th>PO / Ref</th><th>State</th><th>Conformant</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="sub">No {doc === 'all' ? '' : doc + ' '}documents for this partner yet.</td></tr>}
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
        )}
        <div className="pager">
          <span>{total} document{total === 1 ? '' : 's'}{total > 0 ? ` · page ${page + 1} of ${pages}` : ''}</span>
          <div className="spacer" />
          <button className="btn btn-sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      </div>
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
