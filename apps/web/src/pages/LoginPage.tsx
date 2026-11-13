import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{ token: string; refreshToken: string }>("/auth/login", {
        email,
        password,
      });
      localStorage.setItem("jwt", res.token);
      localStorage.setItem("refreshToken", res.refreshToken);
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <form onSubmit={submit} className="card ssmmss-card shadow-sm" style={{ maxWidth: 360, width: "100%" }}>
        <div className="card-body p-4">
          <h1 className="h4 text-center ssmmss-brand mb-1">SSMMSS</h1>
          <p className="text-center text-secondary small mb-4">
            Smart SIM Multi-phone Messaging
          </p>

          {error && (
            <div className="alert alert-danger py-2 small" role="alert">
              {error}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label small" htmlFor="login-user">
              Email or username
            </label>
            <input
              id="login-user"
              type="text"
              className="form-control"
              placeholder="admin"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="form-control"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-100">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
