import { useState } from 'react';
import { Catalog } from './Catalog';
import { Library } from './Library';
import { SkuCatalog } from './SkuCatalog';

/** Client-level shared resources — the connector/transport catalog, the maps/specs library, and the
 * product (SKU) catalog, which partners/orders bind to. (Per-partner bindings live in each Partner workspace.) */
export function Resources() {
  const [tab, setTab] = useState<'catalog' | 'library' | 'sku'>('catalog');
  return (
    <div className="view">
      <div className="ws-tabs" style={{ marginBottom: 18 }}>
        <button className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>◆ Connectors &amp; transports</button>
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>❏ Maps &amp; specs</button>
        <button className={tab === 'sku' ? 'on' : ''} onClick={() => setTab('sku')}>▤ Product catalog</button>
      </div>
      {tab === 'catalog' ? <Catalog /> : tab === 'library' ? <Library /> : <SkuCatalog />}
    </div>
  );
}
