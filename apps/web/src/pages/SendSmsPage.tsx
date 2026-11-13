import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";

type Device = { id: string; name: string; status: string; ready: boolean; isDefault: boolean };
type Sim = { id: string; name: string; slotIndex: number; enabled: boolean };

export default function SendSmsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [simId, setSimId] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"success" | "danger" | "info">("info");
  const [loading, setLoading] = useState(false);

  function loadDevices() {
    api
      .get<{ devices: Device[] }>("/dashboard/devices")
      .then((r) => {
        setDevices(r.devices);
        // Only choose a default when nothing is selected yet — a poll must not
        // override the device the user picked.
        setDeviceId((current) => {
          if (current && r.devices.some((d) => d.id === current)) return current;
          const def = r.devices.find((d) => d.isDefault) ?? r.devices[0];
          return def ? def.id : "";
        });
      })
      .catch(() => {});
  }

  usePolling(loadDevices, 15000);

  useEffect(() => {
    if (!deviceId) return;
    setSims([]);
    setSimId("");
    api
      .get<{ sims: Sim[] }>(`/dashboard/devices/${deviceId}/sims`)
      .then((r) => {
        setSims(r.sims);
        if (r.sims[0]) setSimId(r.sims[0].id);
      })
      .catch(() => {});
  }, [deviceId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      const res = await api.post<{ id: string; status: string }>("/dashboard/messages/send", {
        to,
        message: body,
        deviceId,
        simId,
      });
      setTone("success");
      setStatus(`Queued — ID: ${res.id}`);
      setTo("");
      setBody("");
    } catch (err: any) {
      setTone("danger");
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="h4 mb-4">Send SMS</h2>

      {status && (
        <div className={`alert alert-${tone} py-2 small`} role="alert">
          {status}
        </div>
      )}

      <form onSubmit={send} className="card ssmmss-card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label small" htmlFor="send-device">
              Device
            </label>
            <select
              id="send-device"
              className="form-select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.length === 0 && <option value="">No devices paired</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.ready ? "Online" : "Offline"}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="send-sim">
              SIM
            </label>
            <select
              id="send-sim"
              className="form-select"
              value={simId}
              onChange={(e) => setSimId(e.target.value)}
            >
              {sims.length === 0 && <option value="">No SIM cards</option>}
              {sims.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="send-to">
              Recipient number
            </label>
            <input
              id="send-to"
              type="tel"
              className="form-control"
              placeholder="+639XXXXXXXXX"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="send-body">
              Message
            </label>
            <textarea
              id="send-body"
              className="form-control"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Queuing…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
