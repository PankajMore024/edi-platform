import { api, Descriptor } from '../api';
import { useAsync } from '../useAsync';
import { Loading, ErrorBox } from '../ui';

const ICON: Record<string, string> = { csv: '🧾', xlsx: '📊', database: '🗄️', shopify: '🛒', amazon: '📦', quickbooks: '💵', 'generic-rest': '🔌', sftp: '🔐', webhook: '🪝' };

const Card = ({ d }: { d: Descriptor }) => (
  <div className="card">
    <div className="ch">
      <div className="ci">{ICON[d.id] ?? '◆'}</div>
      <div><div className="cn">{d.name}</div><div className="ck">{d.class ?? d.mode ?? d.kind}</div></div>
    </div>
    <div className="cd">{d.description}</div>
  </div>
);

export function Catalog() {
  const { data, loading, error } = useAsync(() => api.catalog());
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  return (
    <div className="view">
      <p className="intro">The building blocks onboarding composes. <b>Connectors</b> translate a client’s data to/from canonical; <b>transports</b> move the bytes.</p>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--faint)', fontWeight: 600, margin: '0 0 9px' }}>Connectors · {data!.connectors.length}</div>
      <div className="grid cards">{data!.connectors.map((c) => <Card key={c.id} d={c} />)}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--faint)', fontWeight: 600, margin: '22px 0 9px' }}>Transports · {data!.transports.length}</div>
      <div className="grid cards">{data!.transports.map((t) => <Card key={t.id} d={t} />)}</div>
    </div>
  );
}
