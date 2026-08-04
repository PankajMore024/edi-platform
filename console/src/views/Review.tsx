import { useState } from 'react';
import { api, ReviewItem } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';

export function Review({ onChange, relationshipId }: { onChange?: () => void; relationshipId?: string }) {
  const { data, loading, error, reload } = useAsync(() => api.review(relationshipId), [relationshipId]);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, kind: 'dismiss' | 'reprocess') => {
    setBusy(id);
    try {
      const body = { resolvedBy: 'console', note: kind === 'dismiss' ? 'dismissed from console' : 'reprocessed from console' };
      await (kind === 'dismiss' ? api.dismiss(id, body) : api.reprocess(id, body));
      reload(); onChange?.();
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const items = data ?? [];
  return (
    <div className="view">
      <p className="intro">Documents held back from the customer system — a <b>conflict</b> reused a control number with different content; a <b>reject</b> failed conformance. Nothing here was delivered.</p>
      {items.length === 0 && <div className="panel"><div className="empty"><div className="big">✓</div><b>Queue is clear</b><div>No conflicts or rejects awaiting attention.</div></div></div>}
      {items.map((r: ReviewItem) => (
        <div className="rev" key={r.id}>
          <div className={`sev ${r.outcome === 'conflict' ? 's-bad' : 's-warn'}`} />
          <div className="body">
            <div className="lead">
              <div className="t">{r.relationshipId} <span className={`pill ${r.outcome === 'conflict' ? 'p-bad' : 'p-warn'}`}><span className="dot" />{r.outcome}</span>{r.docType && <span className="tag">{r.docType}</span>}</div>
              <div className="reason">{r.note}</div>
            </div>
            <div className="meta"><span className="mono">{r.dedupKey.slice(0, 28)}</span><br />{new Date(r.receivedAt).toLocaleString()}</div>
            <div className="acts">
              <button className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => act(r.id, 'reprocess')}>Reprocess</button>
              <button className="btn btn-sm btn-ghost" disabled={busy === r.id} onClick={() => act(r.id, 'dismiss')}>Dismiss</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
