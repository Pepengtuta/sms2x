import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/send", label: "Send SMS" },
  { to: "/otp", label: "OTP" },
  { to: "/messages", label: "Messages" },
  { to: "/devices", label: "Devices" },
  { to: "/api-keys", label: "API Keys" },
  { to: "/health", label: "Health" },
  { to: "/docs", label: "Docs" },
];

export default function Layout() {
  const navigate = useNavigate();
  function logout() {
    api.clearSession();
    navigate("/login");
  }

  return (
    <div className="min-vh-100 d-flex flex-column">
      <nav className="navbar navbar-expand-lg navbar-dark ssmmss-navbar">
        <div className="container">
          <span className="navbar-brand ssmmss-brand">SSMMSS</span>
          <button
            className="navbar-toggler border-0"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#ssmmss-nav"
            aria-controls="ssmmss-nav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="ssmmss-nav">
            <ul className="navbar-nav me-auto">
              {nav.map((n) => (
                <li className="nav-item" key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                  >
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <button
              onClick={logout}
              className="btn btn-outline-light btn-sm my-2"
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="container py-4 flex-grow-1">
        <Outlet />
      </main>

      <footer className="container py-3 text-secondary small border-top">
        Smart SIM Multi-phone Messaging Sender Service
      </footer>
    </div>
  );
}
