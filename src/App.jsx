import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import SentenceBank from "./pages/SentenceBank.jsx";
import Practice from "./pages/Practice.jsx";
import Dashboard from "./pages/Dashboard.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true" />
          <div className="brand-title">小猫学英语</div>
        </div>

        <NavLink to="/bank" className="nav-link">
          句仓
        </NavLink>
        <NavLink to="/practice" className="nav-link">
          练习
        </NavLink>
        <NavLink to="/dashboard" className="nav-link">
          仪表盘
        </NavLink>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/bank" replace />} />
          <Route path="/bank" element={<SentenceBank />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
