import { useRef, useState } from 'react';
import { api, cert, isClient, partyOf, Principal, CertDoc, CertMessage, CertEvent, Party } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox, Pill, kindFor } from '../ui';

const DOC_NAME: Record<string, string> = { '850': 'Purchase Order', '855': 'PO Acknowledgment', '856': 'Advance Ship Notice', '810': 'Invoice', '846': 'Inventory Advice', '997': 'Functional Ack' };

// ── one doc card: drop a file → validate, show verdict + issues + AI suggestions ──
function CertCard({ doc, principal, onChange }: { doc: CertDoc; principal: Principal; onChange: () => void }) {
  const files = useAsync(() => cert.files(doc.id), [doc.id, doc.attemptCount]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uploadedBy: Party = partyOf(principal.role);
  const isAnchor = doc.role === 'anchor';
  const latest = (files.data ?? [])[(files.data?.length ?? 1) - 1];

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setErr(null);
    try {
      const text = await f.text();
      if (isAnchor) { await cert.setReference(doc.id, text); } else { await cert.dropFile(doc.id, text, uploadedBy); }
      onChange(); files.reload();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const waive = async () => { setBusy(true); try { await cert.waive(doc.id); onChange(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };
  const generate = async () => { setBusy(true); setErr(null); try { await cert.generateReference(doc.id); onChange(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };

  const canUpload = isAnchor ? isClient(principal) : true; // anchor reference is client-only; responses anyone with access
  const uploadLabel = isAnchor ? 'Upload a reference file' : `Drop ${uploadedBy === 'partner' ? 'your' : 'the'} ${doc.docType} test file`;

  return (
    <div className={`card cert-${doc.status}`}>
      <div className="strip" />
      <div className="in">
        <div className="chead">
          <div className="dt">{doc.docType}</div>
          <div className="cinfo"><div className="cname">{DOC_NAME[doc.docType] ?? doc.docType}</div><div className="cdir">{doc.producedBy === 'partner' ? '◂ partner produces' : '▸ we produce'} · {doc.role}</div></div>
          <Pill kind={kindFor(doc.status)} label={doc.status} />
        </div>

        {isAnchor && isClient(principal) && (
          <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={generate} disabled={busy}>{busy ? 'Generating…' : '✦ Generate reference from map'}</button>
        )}
        {canUpload && (
          <label className="drop pick">
            <input ref={fileRef} type="file" accept=".edi,.x12,.txt" style={{ display: 'none' }} onChange={onFile} disabled={busy} />
            <span className="up">⤒</span>{busy ? 'Working…' : uploadLabel}<br /><span style={{ fontSize: 11 }}>.edi / .x12 · validated on drop</span>
          </label>
        )}
        {err && <div className="error" style={{ margin: 0 }}>⚠ {err}</div>}

        {latest && (
          <div className="checks">
            {latest.issues.length === 0 && <div className="check pass"><span className="ci">✓</span><span className="ct">Conforms{latest.correlated ? ' & correlates to the order' : ''}</span></div>}
            {latest.issues.map((i) => (
              <div className="check fail" key={i.id}><span className="ci">✕</span><span className="ct">{i.segment ? <b>{i.segment}{i.element ? `-${i.element}` : ''}</b> : null} {i.message}</span></div>
            ))}
            {latest.issues.filter((i) => i.aiSuggestion).map((i) => (
              <div className="aihint" key={`ai-${i.id}`}><span className="sp">✦ AI</span><span>{i.aiSuggestion}</span></div>
            ))}
          </div>
        )}

        <div className="cfoot">
          <span className="attempt">{doc.attemptCount > 0 ? `Attempt ${doc.attemptCount}` : (isAnchor ? (doc.referenceArtifactId ? 'Reference set' : 'No reference yet') : 'No file yet')}{doc.blocking ? '' : ' · optional'}</span>
          {isClient(principal) && doc.blocking && doc.status !== 'passed' && doc.status !== 'waived' && doc.status !== 'awaiting' && (
            <button className="link" onClick={waive} disabled={busy}>Waive ›</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── the board for one session ── (exported so the partner workspace can embed it, scoped)
export function Board({ sessionId, principal, onBack }: { sessionId: string; principal: Principal; onBack?: () => void }) {
  const detail = useAsync(() => cert.session(sessionId), [sessionId]);
  const events = useAsync(() => cert.events(sessionId), [sessionId]);
  const messages = useAsync(() => cert.messages(sessionId), [sessionId]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => { detail.reload(); events.reload(); messages.reload(); };
  const send = async () => { if (!msg.trim()) return; setBusy(true); try { await cert.postMessage(sessionId, { authorRole: partyOf(principal.role), body: msg }); setMsg(''); messages.reload(); events.reload(); } finally { setBusy(false); } };
  const certify = async () => { setBusy(true); try { await cert.certify(sessionId, principal.email ?? 'ops'); reload(); } catch (x) { alert((x as Error).message); } finally { setBusy(false); } };

  if (detail.loading) return <Loading />;
  if (detail.error) return <ErrorBox msg={detail.error} />;
  const { session, docs, canCertify } = detail.data!;
  const responses = docs.filter((d) => d.role === 'response');
  const passed = responses.filter((d) => d.status === 'passed' || d.status === 'waived').length;
  const groups: Array<[string, CertDoc[]]> = [
    ['Anchor', docs.filter((d) => d.role === 'anchor')],
    ['Responses — validated against the spec', responses],
    ['Standalone feeds', docs.filter((d) => d.role === 'standalone')],
  ];

  return (
    <div className="view">
      <div className="board-top">
        {onBack && <button className="btn btn-ghost btn-sm" onClick={onBack}>‹ Sessions</button>}
        <div style={{ flex: 1 }}>
          <div className="crumb">{session.relationshipId}</div>
          <h2 style={{ margin: '2px 0 0', fontSize: 18 }}>Certification · {session.formatAuthority}-authoritative</h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="sub" style={{ marginBottom: 6 }}>{passed} / {responses.length} responses passed</div>
          {isClient(principal) && (
            session.status === 'certified'
              ? <span className="pill p-ok"><span className="dot" />certified</span>
              : <button className="btn btn-primary btn-sm" disabled={!canCertify || busy} onClick={certify}>Certify &amp; activate ›</button>
          )}
        </div>
      </div>

      {groups.map(([label, list]) => list.length > 0 && (
        <div key={label}>
          <div className="grouphd"><span className="lab">{label}</span><span className="rule" /></div>
          <div className="grid cards">{list.map((d) => <CertCard key={d.id} doc={d} principal={principal} onChange={reload} />)}</div>
        </div>
      ))}

      <div className="board-cols">
        <div className="panel">
          <div className="panel-h"><h3>Messages</h3></div>
          <div className="thread">
            {(messages.data ?? []).length === 0 && <div className="sub" style={{ padding: 14 }}>No messages yet.</div>}
            {(messages.data ?? []).map((m: CertMessage) => (
              <div className="msg" key={m.id}><span className={`who ${m.authorRole === 'partner' ? 'w-partner' : 'w-client'}`}>{m.authorRole}</span><span className="mb">{m.body}</span></div>
            ))}
          </div>
          <div className="composer">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message the counterparty…" onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="btn btn-sm btn-primary" onClick={send} disabled={busy || !msg.trim()}>Send</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Activity</h3><span className="sub" style={{ marginLeft: 'auto', fontSize: 11 }}>stored &amp; visible to both parties</span></div>
          <div className="feed">
            {(events.data ?? []).map((e: CertEvent) => (
              <div className="ev" key={e.id}><span className="evseq">{e.seq}</span><span className="evactor">{e.actor}</span><span className="evverb">{e.verb.replace(/_/g, ' ')}{e.docType ? ` · ${e.docType}` : ''}{e.detail ? ` — ${e.detail}` : ''}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Certification({ principal }: { principal: Principal }) {
  const sessions = useAsync(() => cert.sessions());
  const rels = useAsync(() => (isClient(principal) ? api.relationships() : Promise.resolve([])));
  const [open, setOpen] = useState<string | null>(null);
  const [rel, setRel] = useState('');
  const [busy, setBusy] = useState(false);

  if (open) return <Board sessionId={open} principal={principal} onBack={() => { setOpen(null); sessions.reload(); }} />;
  if (sessions.loading) return <Loading />;
  if (sessions.error) return <ErrorBox msg={sessions.error} />;
  const list = sessions.data ?? [];

  const openNew = async () => { if (!rel) return; setBusy(true); try { const r = await cert.open(rel); setOpen(r.session.id); } catch (x) { alert((x as Error).message); } finally { setBusy(false); } };

  return (
    <div className="view">
      <p className="intro">Certification onboarding — the partner drops test files against the reference spec; each is validated for conformance and correspondence to the order. A relationship goes live only when every response passes.</p>

      {isClient(principal) && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-h"><h3>Open a session</h3><div className="spacer" />
            <select value={rel} onChange={(e) => setRel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--ink)' }}>
              <option value="">Select a relationship…</option>
              {(rels.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.partnerName ?? r.partnerId}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} disabled={!rel || busy} onClick={openNew}>Open</button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h"><h3>Sessions</h3></div>
        {list.length === 0
          ? <div className="empty">No certification sessions yet.</div>
          : <table>
              <thead><tr><th>Relationship</th><th>Authority</th><th>Status</th><th>Opened</th></tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.id} className="click" onClick={() => setOpen(s.id)}>
                  <td className="who">{s.relationshipId}</td><td className="sub">{s.formatAuthority}</td>
                  <td><Pill kind={kindFor(s.status)} label={s.status} /></td>
                  <td className="sub mono">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>
    </div>
  );
}
