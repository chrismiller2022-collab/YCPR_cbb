import { useState } from "react";
import PasswordGate from "./pages/PasswordGate";
import CbbMenuPanel from "./pages/CbbMenuPanel";
import CbbPowerRatingsPanel from "./pages/CbbPowerRatingsPanel";

type View = "menu" | "powerratings";

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("cbb_admin_authed") === "1");
  const [view, setView] = useState<View>("menu");

  if (!authed) {
    return <PasswordGate onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className="page" style={{ maxWidth: "none", margin: "2rem auto", padding: "0 1.5rem 3rem" }}>
      {view === "menu" && <CbbMenuPanel onSelectPowerRatings={() => setView("powerratings")} />}
      {view === "powerratings" && <CbbPowerRatingsPanel onBack={() => setView("menu")} />}
    </div>
  );
}
