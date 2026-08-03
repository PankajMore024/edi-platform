
export const Loading = () => <div className="loading">Loading…</div>;
export const ErrorBox = ({ msg }: { msg: string }) => <div className="error">⚠ {msg}</div>;

type Kind = 'ok' | 'warn' | 'bad' | 'neutral';
export const kindFor = (state: string): Kind => {
  const s = state.toLowerCase();
  if (['delivered', 'accepted', 'processed'].includes(s)) return 'ok';
  if (['rejected', 'conflict'].includes(s)) return 'bad';
  if (['duplicate'].includes(s)) return 'neutral';
  return 'warn';
};
export const Pill = ({ kind, label }: { kind: Kind; label: string }) => (
  <span className={`pill p-${kind}`}><span className="dot" />{label}</span>
);
