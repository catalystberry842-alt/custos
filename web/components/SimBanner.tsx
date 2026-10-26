/** Small, elegant SIMULATION label. `text` shows as a quiet caption from tablet width up. */
export default function SimBanner({ text }: { text?: string }) {
  return (
    <div className="row wrapflex" role="note" style={{ gap: 10 }}>
      <span className="badge sim"><i />Simulation</span>
      {text && <span className="xs dim">{text}</span>}
    </div>
  );
}
