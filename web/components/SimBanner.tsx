export default function SimBanner({ text }: { text?: string }) {
  return (
    <div className="sim" role="note">
      <b>SIMULATION</b>
      <span>{text ?? "Local demo with fake data. Nothing is on-chain, no wallet, no funds."}</span>
    </div>
  );
}
