import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Device = { id: string; name: string; ready: boolean; isDefault: boolean };
type Sim = { id: string; name: string; enabled: boolean };

export default function OtpPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [simId, setSimId] = useState("");
  const [to, setTo] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"success" | "danger" | "info">("info");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ devices: Device[] }>("/dashboard/devices")
      .then((r) => {
        setDevices(r.devices.filter((d) => d.ready));
        const def = r.devices.find((d) => d.isDefault) ?? r.devices[0];
        if (def) setDeviceId(def.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    api
      .get<{ sims: Sim[] }>(`/dashboard/devices/${deviceId}/sims`)
      .then((r) => {
        const enabled = r.sims.filter((s) => s.enabled);
        setSims(enabled);
        if (enabled[0]) setSimId(enabled[0].id);
      })
      .catch(() => {});
  }, [deviceId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    setBusy(true);
    try {
      const r = await api.post<{ id: string; messageId: string; expiresAt: number }>(
        "/dashboard/otp/send",
        { to, deviceId, simId }
      );
      setTone("success");
      setStatus(`Code queued. Message ${r.messageId} — expires ${new Date(r.expiresAt).toLocaleTimeString()}. The code is not shown here; it arrives by SMS.`);
    } catch (err: any) {
      setTone("danger");
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    setBusy(true);
    try {
      const r = await api.post<{ verified: boolean; reason?: string }>("/dashboard/otp/verify", {
        to,
        code,
      });
      if (r.verified) {
        setTone("success");
        setStatus("Code verified.");
      } else {
        setTone("danger");
        setStatus(r.reason ?? "The code could not be verified.");
      }
    } catch (err: any) {
      setTone("danger");
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="h4 mb-4">One-Time Codes</h2>
      <p className="text-secondary mb-4">
        Send a six-digit verification code through your own gateway, then check the code that
        was received. Codes expire after 5 minutes and are stored only as a hash.
      </p>

      {status && (
        <div className={`alert alert-${tone} py-2 small`} role="alert">
          {status}
        </div>
      )}

      <div className="card ssmmss-card mb-4" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <h3 className="h6 mb-3">Send a code</h3>

          <div className="mb-3">
            <label className="form-label small" htmlFor="otp-device">
              Device
            </label>
            <select
              id="otp-device"
              className="form-select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.length === 0 && <option value="">No ready devices</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="otp-sim">
              SIM
            </label>
            <select
              id="otp-sim"
              className="form-select"
              value={simId}
              onChange={(e) => setSimId(e.target.value)}
            >
              {sims.length === 0 && <option value="">No enabled SIMs</option>}
              {sims.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="otp-to">
              Recipient number
            </label>
            <input
              id="otp-to"
              type="tel"
              className="form-control"
              placeholder="+639XXXXXXXXX"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? "Working…" : "Send Code"}
          </button>
        </div>
      </div>

      <div className="card ssmmss-card mb-4" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <h3 className="h6 mb-3">Verify a code</h3>

          <div className="mb-3">
            <label className="form-label small" htmlFor="otp-code">
              Six-digit code
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="form-control ssmmss-mono"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>

          <button type="submit" className="btn btn-secondary" onClick={verify} disabled={busy}>
            {busy ? "Working…" : "Verify Code"}
          </button>
        </div>
      </div>
    </div>
  );
}
