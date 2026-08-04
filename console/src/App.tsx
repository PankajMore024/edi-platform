import { useState } from 'react';
import { getKey, setKey, clearKey, auth, isClient, Principal } from './api';
import { useAsync } from './useAsync';
import { Partners } from './views/Partners';
import { Resources } from './views/Resources';
import { PartnerWorkspace } from './views/PartnerWorkspace';
import { Certification } from './views/Certification';

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
        <p>{mode === 'login' ? 'Sign in to your workspace.' : 'Connect with a tenant API key.'}</p>
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

type ClientView = 'partners' | 'resources';

// The client-operator console: hierarchical Partner drill-down (Phase A — per-tenant, no Clients tab).
function ClientConsole({ principal, onSignOut }: { principal: Principal; onSignOut: () => void }) {
  const [view, setView] = useState<ClientView>('partners');
  const [partnerId, setPartnerId] = useState<string | null>(null);

  const NAV: Array<[ClientView, string, string]> = [['partners', 'Partners', '⚏'], ['resources', 'Resources', '◆']];
  const toClient = (v: ClientView) => { setPartnerId(null); setView(v); };

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="mark">⇄</div><div><b>Interchange</b><span>EDI Control Plane</span></div></div>
        <nav className="nav">
          <div className="grp">Workspace</div>
          {NAV.map(([v, label, ic]) => (
            <button key={v} className={!partnerId && view === v ? 'on' : ''} onClick={() => toClient(v)}>
              <span style={{ width: 17, textAlign: 'center' }}>{ic}</span> {label}
            </button>
          ))}
        </nav>
        <div className="foot"><span>{principal.email ?? 'client_admin'}</span><button onClick={onSignOut}>Sign out</button></div>
      </aside>
      <div className="main">
        <header className="top">
          <div className="crumbs">
            <button onClick={() => toClient('partners')}>Partners</button>
            {partnerId && <><span className="sep">/</span><span className="cur">Partner workspace</span></>}
            {!partnerId && view === 'resources' && <><span className="sep">/</span><span className="cur">Resources</span></>}
          </div>
        </header>
        {partnerId
          ? <PartnerWorkspace relationshipId={partnerId} principal={principal} onBack={() => setPartnerId(null)} />
          : view === 'partners' ? <Partners onOpen={setPartnerId} /> : <Resources />}
      </div>
    </div>
  );
}

// The partner-operator console: only their scoped certification board.
function PartnerConsole({ principal, onSignOut }: { principal: Principal; onSignOut: () => void }) {
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="mark">⇄</div><div><b>Interchange</b><span>Partner Onboarding</span></div></div>
        <nav className="nav"><div className="grp">Onboarding</div><button className="on"><span style={{ width: 17, textAlign: 'center' }}>◎</span> Certification</button></nav>
        <div className="foot"><span>{principal.email ?? principal.role}</span><button onClick={onSignOut}>Sign out</button></div>
      </aside>
      <div className="main">
        <header className="top"><div><div className="crumb">Onboarding</div><h1>Certification</h1></div></header>
        <Certification principal={principal} />
      </div>
    </div>
  );
}

export function App() {
  const [token, setToken] = useState(getKey());
  const me = useAsync<Principal | null>(() => (token ? auth.me() : Promise.resolve(null)), [token]);

  const authed = (t: string) => { setKey(t); setToken(t); };
  const signOut = () => { auth.logout().catch(() => {}); clearKey(); setToken(''); };

  if (!token) return <LoginGate onAuthed={authed} />;
  if (me.loading) return <div className="gate"><div className="box"><div className="loading">Connecting…</div></div></div>;
  if (me.error || !me.data) return <LoginGate onAuthed={authed} note="Session expired — sign in again." />;

  return isClient(me.data)
    ? <ClientConsole principal={me.data} onSignOut={signOut} />
    : <PartnerConsole principal={me.data} onSignOut={signOut} />;
}
