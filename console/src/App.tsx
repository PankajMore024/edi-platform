import React, { useState } from 'react';
import { getKey, setKey, clearKey, api, auth, isClient, Principal } from './api';
import { useAsync } from './useAsync';
import { Catalog } from './views/Catalog';
import { Documents } from './views/Documents';
import { Review } from './views/Review';
import { Partners } from './views/Partners';
import { Library } from './views/Library';
import { Certification } from './views/Certification';

type View = 'certification' | 'review' | 'documents' | 'partners' | 'catalog' | 'library';
const TITLE: Record<View, [string, string]> = {
  certification: ['Onboarding', 'Certification'],
  review: ['Operate', 'Review queue'], documents: ['Operate', 'Transactions'],
  partners: ['Configure', 'Trading partners'], catalog: ['Configure', 'Connectors & transports'],
  library: ['Configure', 'Maps & specs'],
};
const navFor = (p: Principal): Array<{ grp: string; items: Array<[View, string, string]> }> =>
  isClient(p)
    ? [
        { grp: 'Operate', items: [['certification', 'Certification', '◎'], ['review', 'Review queue', '⚑'], ['documents', 'Transactions', '▦']] },
        { grp: 'Configure', items: [['partners', 'Partners', '⚏'], ['catalog', 'Connectors & transports', '◆'], ['library', 'Maps & specs', '❏']] },
      ]
    : [{ grp: 'Onboarding', items: [['certification', 'Certification', '◎']] }];

function LoginGate({ onAuthed, note }: { onAuthed: (token: string) => void; note?: string }) {
  const [mode, setMode] = useState<'login' | 'key'>('login');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [key, setKeyVal] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const doLogin = async () => { setBusy(true); setErr(null); try { const r = await auth.login(email, pw); onAuthed(r.token); } catch { setErr('Invalid email or password.'); } finally { setBusy(false); } };
  return (
    <div className="gate">
      <div className="box">
        <div className="mark">⇄</div>
        <h1>Interchange</h1>
        <p>{mode === 'login' ? 'Sign in to your onboarding workspace.' : 'Connect with a tenant API key.'}</p>
        <div className="toggle" style={{ marginBottom: 16, width: '100%' }}>
          <button className={mode === 'login' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setMode('login')}>Email &amp; password</button>
          <button className={mode === 'key' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setMode('key')}>API key</button>
        </div>
        {mode === 'login' ? (
          <>
            <input placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !email || !pw} onClick={doLogin}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </>
        ) : (
          <>
            <input placeholder="edi_…" value={key} onChange={(e) => setKeyVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && onAuthed(key.trim())} />
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={!key.trim()} onClick={() => onAuthed(key.trim())}>Connect</button>
          </>
        )}
        {(err || note) && <div className="error" style={{ marginTop: 14, marginBottom: 0 }}>⚠ {err ?? note}</div>}
      </div>
    </div>
  );
}

export function App() {
  const [token, setToken] = useState(getKey());
  const me = useAsync<Principal | null>(() => (token ? auth.me() : Promise.resolve(null)), [token]);
  const [view, setView] = useState<View>('certification');

  const authed = (t: string) => { setKey(t); setToken(t); };
  const signOut = () => { auth.logout().catch(() => {}); clearKey(); setToken(''); };

  if (!token) return <LoginGate onAuthed={authed} />;
  if (me.loading) return <div className="gate"><div className="box"><div className="loading">Connecting…</div></div></div>;
  if (me.error || !me.data) return <LoginGate onAuthed={authed} note="Session expired — sign in again." />;

  const principal = me.data;
  const NAV = navFor(principal);
  const active: View = NAV.some((g) => g.items.some(([v]) => v === view)) ? view : NAV[0].items[0][0];
  const showReviewBadge = isClient(principal);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="mark">⇄</div><div><b>Interchange</b><span>{isClient(principal) ? 'EDI Control Plane' : 'Partner Onboarding'}</span></div></div>
        <nav className="nav">
          {NAV.map((g) => (
            <React.Fragment key={g.grp}>
              <div className="grp">{g.grp}</div>
              {g.items.map(([v, label, ic]) => (
                <button key={v} className={active === v ? 'on' : ''} onClick={() => setView(v)}>
                  <span style={{ width: 17, textAlign: 'center' }}>{ic}</span> {label}
                  {v === 'review' && showReviewBadge && <ReviewBadge />}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="foot"><span>{principal.email ?? (isClient(principal) ? 'client_admin' : principal.role)}</span><button onClick={signOut}>Sign out</button></div>
      </aside>
      <div className="main">
        <header className="top"><div><div className="crumb">{TITLE[active][0]}</div><h1>{TITLE[active][1]}</h1></div></header>
        {active === 'certification' && <Certification principal={principal} />}
        {active === 'review' && <Review onChange={() => {}} />}
        {active === 'documents' && <Documents />}
        {active === 'partners' && <Partners />}
        {active === 'catalog' && <Catalog />}
        {active === 'library' && <Library />}
      </div>
    </div>
  );
}

function ReviewBadge() {
  const q = useAsync(() => api.review());
  const n = q.data?.length ?? 0;
  return n > 0 ? <span className="badge">{n}</span> : null;
}
