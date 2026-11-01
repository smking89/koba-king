import { Routes, Route } from "react-router-dom";
import AppShell from "./AppShell";
import { HomePage } from "../components/HomePage";
import Support from "./pages/Support";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell><HomePage /></AppShell>} />
      <Route path="/support" element={<AppShell><Support /></AppShell>} />
    </Routes>
  );
}
