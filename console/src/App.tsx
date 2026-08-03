import React, { useState } from 'react';
import { getKey, setKey, clearKey, api } from './api';
import { useAsync } from './useAsync';
import { Catalog } from './views/Catalog';
import { Documents } from './views/Documents';
import { Review } from './views/Review';
import { Partners } from './views/Partners';
import { Library } from './views/Library';

type View = 'review' | 'documents' | 'partners' | 'catalog' | 'library';
const NAV: Array<{ grp: string; items: Array<[View, string, string]> }> = [
  { grp: 'Operate', items: [['review', 'Review queue', '⚑'], ['documents', 'Documents', '▦']] },
  { grp: 'Configure', items: [['partners', 'Partners', '⚏'], ['catalog', 'Connectors & transports', '◆'], ['library', 'Maps & specs', '❏']] },
];
const TITLE: Record<View, [string, string]> = {
  review: ['Operate', 'Review queue'], documents: ['Operate', 'Documents'],
  partners: ['Configure', 'Trading partners'], catalog: ['Configure', 'Connectors & transports'],
  library: ['Configure', 'Maps & specs'],
};

function KeyGate({ onSet }: { onSet: (k: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="gate">
      <div className="box">
        <div className="mark">⇄</div>
        <h1>Interchange</h1>
        <p>Enter your tenant API key to connect to the EDI control plane.</p>
        <input placeholder="edi_…" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && val && onSet(val)} />
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={!val.trim()} onClick={() => onSet(val)}>Connect</button>
      </div>
    </div>
  );
}

export function App() {
  const [key, setKeyState] = useState(getKey());
  const [view, setView] = useState<View>('documents');
  const reviewCount = useAsync(() => (key ? api.review() : Promise.resolve([])), [key, view]);

  if (!key) return <KeyGate onSet={(k) => { setKey(k); setKeyState(getKey()); }} />;

  const badge = reviewCount.data?.length ?? 0;
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="mark">⇄</div><div><b>Interchange</b><span>EDI Control Plane</span></div></div>
        <nav className="nav">
          {NAV.map((g) => (
            <React.Fragment key={g.grp}>
              <div className="grp">{g.grp}</div>
              {g.items.map(([v, label, ic]) => (
                <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                  <span style={{ width: 17, textAlign: 'center' }}>{ic}</span> {label}
                  {v === 'review' && badge > 0 && <span className="badge">{badge}</span>}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="foot"><span>Connected</span><button onClick={() => { clearKey(); setKeyState(''); }}>Sign out</button></div>
      </aside>
      <div className="main">
        <header className="top"><div><div className="crumb">{TITLE[view][0]}</div><h1>{TITLE[view][1]}</h1></div></header>
        {view === 'review' && <Review onChange={reviewCount.reload} />}
        {view === 'documents' && <Documents />}
        {view === 'partners' && <Partners />}
        {view === 'catalog' && <Catalog />}
        {view === 'library' && <Library />}
      </div>
    </div>
  );
}
