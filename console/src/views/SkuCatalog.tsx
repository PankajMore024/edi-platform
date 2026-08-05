import { useState } from 'react';
import { api, productCatalog, CatalogEntry } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';

const blank = (): CatalogEntry => ({ sellableSku: '', vendorId: '', vendorSku: '' });

// Parse pasted CSV: sellableSku,vendorId,vendorSku,packSize,uom,priority (header optional).
function parseCsv(text: string): CatalogEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: CatalogEntry[] = [];
  for (const line of lines) {
    const [sellableSku, vendorId, vendorSku, packSize, uom, priority] = line.split(',').map((c) => c.trim());
    if (!sellableSku || sellableSku.toLowerCase() === 'sellablesku' || !vendorId || !vendorSku) continue; // skip header/invalid
    out.push({ sellableSku, vendorId, vendorSku, packSize: packSize ? Number(packSize) : undefined, uom: uom || undefined, priority: priority ? Number(priority) : undefined });
  }
  return out;
}

export function SkuCatalog() {
  const { data, loading, error, reload } = useAsync(() => productCatalog.list());
  const rels = useAsync(() => api.relationships());
  const [row, setRow] = useState<CatalogEntry>(blank());
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const entries = data ?? [];
  const vendorName = (id: string) => (rels.data ?? []).find((r) => r.id === id)?.partnerName ?? id;

  const add = async () => {
    if (!row.sellableSku || !row.vendorId || !row.vendorSku) { setMsg('Sellable SKU, vendor, and vendor SKU are required.'); return; }
    setBusy(true); setMsg(null);
    try { await productCatalog.upsert(row); setRow(blank()); reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const importCsv = async () => {
    const parsed = parseCsv(csv);
    if (!parsed.length) { setMsg('No valid rows found. Format: sellableSku,vendorId,vendorSku,packSize,uom,priority'); return; }
    setBusy(true); setMsg(null);
    try { const r = await productCatalog.bulk(parsed); setCsv(''); setMsg(`Imported ${r.upserted}${r.skipped ? `, skipped ${r.skipped}` : ''}.`); reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const del = async (e: CatalogEntry) => { setBusy(true); try { await productCatalog.remove(e.sellableSku, e.vendorId); reload(); } catch (x) { setMsg((x as Error).message); } finally { setBusy(false); } };

  return (
    <div className="view">
      <p className="intro">The <b>product catalog</b> maps each sellable SKU to a vendor’s part number (+ pack/UoM). It routes a customer order to the right vendor(s) and translates SKUs onto the 850. A line whose SKU isn’t here is held for review — never shipped blind. (The prefix convention on a relationship is the lightweight alternative.)</p>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-h"><h3>Bindings</h3><div className="spacer" /><span className="sub">{entries.length} SKU × vendor</span></div>
        <table>
          <thead><tr><th>Sellable SKU</th><th>Vendor</th><th>Vendor SKU</th><th>Pack</th><th>UoM</th><th>Priority</th><th /></tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={7} className="sub">No bindings yet — add one below or import a CSV.</td></tr>}
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="mono">{e.sellableSku}</td><td>{vendorName(e.vendorId)}</td><td className="mono">{e.vendorSku}</td>
                <td className="sub">{e.packSize ?? '—'}</td><td className="sub">{e.uom ?? '—'}</td><td className="sub">{e.priority ?? 0}</td>
                <td className="rowacts"><button className="iconbtn danger" title="Delete" disabled={busy} onClick={() => del(e)}>🗑</button></td>
              </tr>
            ))}
            <tr className="addrow">
              <td><input className="mono" value={row.sellableSku} onChange={(ev) => setRow({ ...row, sellableSku: ev.target.value })} placeholder="WIDGET-BLUE" /></td>
              <td><input list="vendors" value={row.vendorId} onChange={(ev) => setRow({ ...row, vendorId: ev.target.value })} placeholder="vendor (relationship)" /></td>
              <td><input className="mono" value={row.vendorSku} onChange={(ev) => setRow({ ...row, vendorSku: ev.target.value })} placeholder="RDG-4471" /></td>
              <td><input style={{ width: 56 }} inputMode="numeric" value={row.packSize ?? ''} onChange={(ev) => setRow({ ...row, packSize: ev.target.value ? Number(ev.target.value) : undefined })} placeholder="12" /></td>
              <td><input style={{ width: 48 }} value={row.uom ?? ''} onChange={(ev) => setRow({ ...row, uom: ev.target.value || undefined })} placeholder="CA" /></td>
              <td><input style={{ width: 48 }} inputMode="numeric" value={row.priority ?? ''} onChange={(ev) => setRow({ ...row, priority: ev.target.value ? Number(ev.target.value) : undefined })} placeholder="0" /></td>
              <td className="rowacts"><button className="btn btn-sm btn-primary" disabled={busy} onClick={add}>Add</button></td>
            </tr>
          </tbody>
        </table>
        <datalist id="vendors">{(rels.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.partnerName ?? r.partnerId}</option>)}</datalist>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Import CSV</h3><div className="spacer" /><span className="sub mono">sellableSku,vendorId,vendorSku,packSize,uom,priority</span></div>
        <div style={{ padding: 14 }}>
          <textarea className="sample" value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} placeholder={'WIDGET-BLUE,rel-ridgeline,RDG-4471,12,CA,1\nGADGET,rel-summit,SMT-9'} style={{ minHeight: 120 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" disabled={busy || !csv.trim()} onClick={importCsv}>Import rows</button>
            {msg && <span className="sub">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
