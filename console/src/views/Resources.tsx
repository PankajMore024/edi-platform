import { useState } from 'react';
import { Catalog } from './Catalog';
import { Library } from './Library';

/** Client-level shared resources — the connector/transport catalog and the maps/specs library, which
 * partners bind to. (Per-partner bindings are configured inside each Partner workspace.) */
export function Resources() {
  const [tab, setTab] = useState<'catalog' | 'library'>('catalog');
  return (
    <div className="view">
      <div className="ws-tabs" style={{ marginBottom: 18 }}>
        <button className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>◆ Connectors &amp; transports</button>
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>❏ Maps &amp; specs</button>
      </div>
      {tab === 'catalog' ? <Catalog /> : <Library />}
    </div>
  );
}
