import { useState } from "react";

// Checks against api/cbb.ts's own "checkPassword" action — this app has
// no admin-save.ts of its own, unlike the main YCPR (CFB) repo. Uses the
// same ADMIN_PASSWORD env var by convention, but it's a separate Vercel
// project/env now, so setting it here doesn't touch the CFB site's.
export default function PasswordGate({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit() {
    if (!password) {
      setError("Enter a password first.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/cbb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action: "checkPassword" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Incorrect password");
        return;
      }
      sessionStorage.setItem("cbb_admin_authed", "1");
      sessionStorage.setItem("admin_password", password);
      onAuthed();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      <h2>College Basketball Admin</h2>
      <p>Enter the admin password to continue.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        style={{ width: "100%", padding: "0.6rem", marginBottom: "0.75rem" }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button className="menu-btn" onClick={submit} disabled={checking}>
        {checking ? "Checking…" : "Continue"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
