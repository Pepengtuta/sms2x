import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "react-qr-code";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import RelativeTime from "../components/RelativeTime";

type Device = {
  id: string;
  name: string;
  status: string;
  ready: boolean;
  state: string;
  summary: string;
  isDefault: boolean;
  simCount: number;
  androidVersion?: string;
  lastSeenAt?: number;
};

const STATE_TONE: Record<string, string> = {
  ready: "success",
  offline: "secondary",
  stale: "warning",
  revoked: "danger",
  unknown: "info",
};

// The Android app registers for this scheme, so scanning the QR opens the app.
const PAIR_SCHEME = "ssmmss://pair";

export function pairingUri(token: string, serverUrl: string): string {
  const params = new URLSearchParams({ token });
  if (serverUrl) params.set("url", serverUrl);
  return `${PAIR_SCHEME}?${params.toString()}`;
}

function defaultServerUrl(): string {
  const host = window.location.hostname || "localhost";
  return `http://${host}:3000`;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem("phoneServerUrl") ?? defaultServerUrl()
  );

  function load() {
    api
      .get<{ devices: Device[] }>("/dashboard/devices")
      .then((r) => setDevices(r.devices))
      .catch((e) => setError(e.message));
  }

  const { refreshedAt, refresh } = usePolling(load, 15000);

  useEffect(() => {
    // Ask the API which address a phone can reach, so the QR carries a usable URL.
    if (localStorage.getItem("phoneServerUrl")) return;
    api
      .get<{ lanUrl: string }>("/server-info")
      .then((r) => {
        if (r.lanUrl && r.lanUrl !== "http://localhost:3000") {
          setServerUrl(r.lanUrl);
          localStorage.setItem("phoneServerUrl", r.lanUrl);
        }
      })
      .catch(() => {});
  }, []);

  async function setDefault(id: string) {
    try {
      await api.post("/dashboard/devices/default", { deviceId: id });
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createPairingToken() {
    try {
      const r = await api.post<{ token: string }>("/dashboard/pairing-token");
      setToken(r.token);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function updateServerUrl(value: string) {
    setServerUrl(value);
    localStorage.setItem("phoneServerUrl", value);
  }

  const uri = token ? pairingUri(token, serverUrl) : "";

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h4 mb-0">Devices</h2>
        <div className="d-flex align-items-center gap-3">
          <RelativeTime at={refreshedAt} />
          <button className="btn btn-secondary btn-sm" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 small" role="alert">
          {error}
        </div>
      )}

      <div className="card ssmmss-card mb-4">
        <div className="table-responsive">
          <div className="table-responsive"><table className="table align-middle mb-0 ssmmss-table">
            <thead className="table-light">
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">SIMs</th>
                <th scope="col">Last Seen</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-4">
                    No devices paired yet. Generate a pairing token and scan the QR code with
                    your Android phone.
                  </td>
                </tr>
              )}
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/devices/${d.id}`} className="text-decoration-none fw-semibold">
                      {d.name}
                    </Link>
                    {d.isDefault && <span className="text-secondary"> (default)</span>}
                    <div className="text-secondary small">{d.summary}</div>
                  </td>
                  <td>
                    <span className={`badge text-bg-${STATE_TONE[d.state] ?? "secondary"}`}>
                      {d.state}
                    </span>
                  </td>
                  <td>{d.simCount}</td>
                  <td className="text-secondary small">
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—"}
                  </td>
                  <td className="text-end">
                    {!d.isDefault && (
                      <button
                        onClick={() => setDefault(d.id)}
                        className="btn btn-outline-primary btn-sm"
                        type="button"
                      >
                        Set Default
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>

      <h3 className="h5 mb-3">Pair a Device</h3>

      <div className="card ssmmss-card mb-3" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <label className="form-label small" htmlFor="pair-url">
            Phone server URL (the address your phone uses to reach this API)
          </label>
          <input
            id="pair-url"
            className="form-control ssmmss-mono"
            value={serverUrl}
            onChange={(e) => updateServerUrl(e.target.value)}
            placeholder="http://192.168.1.50:3000"
          />
          <button
            onClick={createPairingToken}
            className="btn btn-primary mt-3"
            type="button"
          >
            Generate Pairing Token
          </button>
        </div>
      </div>

      {token && (
        <div className="card ssmmss-card mb-3" style={{ maxWidth: 560 }}>
          <div className="card-body">
            <h4 className="h6 mb-3">Scan to pair</h4>
            <div className="ssmmss-qr border rounded">
              <QRCode value={uri} size={220} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
            </div>
            <p className="text-secondary small mt-3 mb-0">
              Scan with your phone&apos;s camera to pair. The token expires in 5 minutes.
            </p>
          </div>
        </div>
      )}

      {token && (
        <div className="card ssmmss-card mb-3" style={{ maxWidth: 560 }}>
          <div className="card-body">
            <h4 className="h6 mb-2">Manual entry</h4>
            <p className="text-secondary small mb-2">
              If you cannot scan, enter this token in the app&apos;s Pairing token field.
            </p>
            <code className="ssmmss-mono ssmmss-break d-block p-2 border rounded bg-light">
              {token}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
