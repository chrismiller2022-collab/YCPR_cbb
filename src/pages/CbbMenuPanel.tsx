// College Basketball's own admin landing page. This app is now a fully
// separate deployment from the CFB site (see chat: moved out specifically
// to get its own Vercel Hobby 12-function budget), so "College Football"
// is a real external link back to the main site rather than an
// in-app view swap.
export default function CbbMenuPanel({ onSelectPowerRatings }: { onSelectPowerRatings: () => void }) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>College Basketball</h2>
      <p style={{ color: "var(--chalk-dim)", fontSize: "0.85rem", marginTop: 0 }}>Its own space, separate from the CFB admin.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", maxWidth: 700 }}>
        <button
          className="menu-btn"
          onClick={onSelectPowerRatings}
          style={{ textAlign: "left", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}
        >
          <span style={{ fontWeight: 700 }}>Power Ratings</span>
          <span style={{ fontSize: "0.78rem", color: "var(--chalk-dim)", fontWeight: 400 }}>
            Team roster, conferences, SRS/Elo, Massey — one system per column.
          </span>
        </button>
        <a
          className="menu-btn"
          href="https://ycpr.vercel.app/admin"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textAlign: "left", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.3rem", textDecoration: "none" }}
        >
          <span style={{ fontWeight: 700 }}>College Football ↗</span>
          <span style={{ fontSize: "0.78rem", color: "var(--chalk-dim)", fontWeight: 400 }}>Opens the main YCPR admin in a new tab.</span>
        </a>
      </div>
    </div>
  );
}
