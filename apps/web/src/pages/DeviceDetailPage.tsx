import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import RelativeTime from "../components/RelativeTime";

type Check = { id: string; label: string; ok: boolean; detail: string };

type Sim = {
  id: string;
  subscriptionId: number;
  slotIndex: number;
  carrierName: string;
  phoneNumber?: string;
  enabled: boolean;
  isDefault: boolean;
};

type Detail = {
  device: {
    id: string;
    name: string;
    status: string;
    ready: boolean;
    state: string;
    verdict: string;
    checks: Check[];
    summary: string;
    gatewayEnabled: boolean;
    androidVersion?: string;
    serviceRunning?: boolean;
    permissions?: Record<string, string>;
    isDefault: boolean;
    lastSeenAt: number;
    pairedAt: number;
    revokedAt?: number;
  };
  sims: Sim[];
  messageCounts: { total: number; sent: number; failed: number; queued: number };
  simCounts: { simId: string; carrierName: string; sent: number; failed: number }[];
  failures: { reason: string; count: number }[];
  timeline: { day: string; sent: number; failed: number }[];
  recentMessages: {
    id: string;
    to: string;
    body: string;
    status: string;
    errorMessage?: string;
    createdAt: number;
  }[];
};

const STATE_TONE: Record<string, string> = {
  ready: "success",
  offline: "secondary",
  stale: "warning",
  revoked: "danger",
  unknown: "info",
};

const STATUS_TONE: Record<string, string> = {
  sent: "success",
  failed: "danger",
  sending: "info",
  queued: "secondary",
};

function maskPhone(phone?: string): string {
  if (!phone || phone.length <= 4) return phone || "Not available";
  return "•".repeat(Math.max(0, phone.length - 4)) + phone.slice(-4);
}

export default function DeviceDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const renamingRef = useRef(false);

  function load() {
    api
      .get<Detail>(`/dashboard/devices/${id}`)
      .then((r) => {
        setData(r);
        // Don't overwrite what the user is typing.
        if (!renamingRef.current) setName(r.device.name);
      })
      .catch((e) => setError(e.message));
  }

  const { refreshedAt, refresh } = usePolling(load, 15000);

  async function patch(body: unknown) {
    try {
      await api.patch(`/dashboard/devices/${id}`, body);
      setRenaming(false);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function patchSim(simId: string, body: unknown) {
    try {
      await api.patch(`/dashboard/devices/${id}/sims/${simId}`, body);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function unpair() {
    if (!confirm("Unpair this device? It will stop sending messages and must be paired again. Its message history is kept.")) return;
    try {
      await api.post(`/dashboard/devices/${id}/revoke`);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!data) {
    return (
      <div>
        <h2 className="h4 mb-4">Device</h2>
        {error ? (
          <div className="alert alert-danger py-2 small">{error}</div>
        ) : (
          <p className="text-secondary">Loading device…</p>
        )}
        <Link to="/devices" className="btn btn-secondary btn-sm">
          Back to Devices
        </Link>
      </div>
    );
  }

  const d = data.device;
  const maxTimeline = Math.max(1, ...data.timeline.map((t) => Math.max(t.sent, t.failed)));

  return (
    <div>
      <Link to="/devices" className="btn btn-secondary btn-sm mb-3">
        Back to Devices
      </Link>

      <div className="d-flex justify-content-end align-items-center gap-3 mb-3">
        <RelativeTime at={refreshedAt} />
        <button className="btn btn-secondary btn-sm" onClick={refresh} type="button">
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-danger py-2 small" role="alert">
          {error}
        </div>
      )}

      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <h2 className="h4 mb-1">{d.name}</h2>
              <div className="text-secondary small">
                {d.androidVersion ? `Android ${d.androidVersion}` : "Android version unknown"} ·
                Paired {new Date(d.pairedAt).toLocaleDateString()} · Last seen{" "}
                {new Date(d.lastSeenAt).toLocaleString()}
              </div>
            </div>
            <span className={`badge text-bg-${STATE_TONE[d.state] ?? "secondary"}`}>
              {d.state.toUpperCase()}
            </span>
          </div>
          <p className="mb-0 mt-3">{d.verdict}</p>
        </div>
      </div>

      <h3 className="h5 mb-3">Readiness checklist</h3>
      <ul className="list-group mb-4">
        {d.checks.map((c) => (
          <li className="list-group-item d-flex justify-content-between align-items-center" key={c.id}>
            <span>{c.label}</span>
            <span className="text-end">
              <span className={`badge text-bg-${c.ok ? "success" : "danger"} me-2`}>
                {c.ok ? "PASS" : "FAIL"}
              </span>
              <span className="text-secondary small">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="h5 mb-3">Message counts</h3>
      <div className="row g-3 mb-4">
        {[
          { label: "Total", value: data.messageCounts.total, tone: "primary" },
          { label: "Sent", value: data.messageCounts.sent, tone: "success" },
          { label: "Failed", value: data.messageCounts.failed, tone: "danger" },
          { label: "Queued", value: data.messageCounts.queued, tone: "info" },
        ].map((s) => (
          <div className="col-6 col-lg-3" key={s.label}>
            <div className="card ssmmss-card">
              <div className="card-body py-3">
                <div className={`ssmmss-stat fs-2 text-${s.tone}`}>{s.value}</div>
                <div className="text-secondary small text-uppercase">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h3 className="h5 mb-3">Last 7 days</h3>
      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-end gap-2" style={{ height: 120 }}>
            {data.timeline.map((t) => (
              <div className="flex-fill text-center" key={t.day}>
                <div className="d-flex flex-column-reverse gap-1" style={{ height: 90 }}>
                  <div
                    className="bg-danger rounded"
                    style={{ height: `${(t.failed / maxTimeline) * 100}%`, minHeight: t.failed ? 4 : 0 }}
                    title={`${t.failed} failed`}
                  />
                  <div
                    className="bg-success rounded"
                    style={{ height: `${(t.sent / maxTimeline) * 100}%`, minHeight: t.sent ? 4 : 0 }}
                    title={`${t.sent} sent`}
                  />
                </div>
                <div className="text-secondary small mt-1">{t.day.slice(5)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 small">
            <span className="badge text-bg-success me-2">sent</span>
            <span className="badge text-bg-danger">failed</span>
          </div>
        </div>
      </div>

      {data.failures.length > 0 && (
        <>
          <h3 className="h5 mb-3">Failure reasons</h3>
          <ul className="list-group mb-4">
            {data.failures.map((f) => (
              <li className="list-group-item d-flex justify-content-between" key={f.reason}>
                <span className="ssmmss-break">{f.reason}</span>
                <span className="badge text-bg-danger">{f.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="h5 mb-3">SIM cards ({data.sims.length})</h3>
      <div className="card ssmmss-card mb-4">
        <div className="table-responsive">
          <div className="table-responsive"><table className="table align-middle mb-0 ssmmss-table">
            <thead className="table-light">
              <tr>
                <th scope="col">Carrier</th>
                <th scope="col">Slot</th>
                <th scope="col">Number</th>
                <th scope="col">Sent</th>
                <th scope="col">Failed</th>
                <th scope="col">Enabled</th>
                <th scope="col">Default</th>
              </tr>
            </thead>
            <tbody>
              {data.sims.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-4">
                    No SIMs reported yet.
                  </td>
                </tr>
              )}
              {data.sims.map((s) => {
                const counts = data.simCounts.find((c) => c.simId === s.id);
                return (
                  <tr key={s.id}>
                    <td>{s.carrierName}</td>
                    <td>{s.slotIndex + 1}</td>
                    <td className="ssmmss-mono">{maskPhone(s.phoneNumber)}</td>
                    <td>{counts?.sent ?? 0}</td>
                    <td>{counts?.failed ?? 0}</td>
                    <td>
                      <div className="form-check form-switch mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={s.enabled}
                          onChange={(e) => patchSim(s.id, { enabled: e.target.checked })}
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        className="form-check-input"
                        type="radio"
                        name="defaultSim"
                        checked={s.isDefault}
                        onChange={() => patchSim(s.id, { isDefault: true })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      </div>

      <h3 className="h5 mb-3">Recent messages</h3>
      <div className="card ssmmss-card mb-4">
        <div className="table-responsive">
          <div className="table-responsive"><table className="table align-middle mb-0 ssmmss-table">
            <thead className="table-light">
              <tr>
                <th scope="col">To</th>
                <th scope="col">Message</th>
                <th scope="col">Status</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentMessages.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-secondary py-4">
                    No messages yet.
                  </td>
                </tr>
              )}
              {data.recentMessages.map((m) => (
                <tr key={m.id}>
                  <td className="ssmmss-mono">{m.to}</td>
                  <td>
                    <div className="text-truncate" style={{ maxWidth: 260 }}>
                      {m.body}
                    </div>
                    {m.errorMessage && <div className="text-danger small">{m.errorMessage}</div>}
                  </td>
                  <td>
                    <span className={`badge text-bg-${STATUS_TONE[m.status] ?? "secondary"}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="text-secondary small">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>

      <h3 className="h5 mb-3">Device actions</h3>
      <div className="card ssmmss-card mb-4">
        <div className="card-body d-flex flex-wrap gap-2 align-items-center">
          {renaming ? (
            <>
              <input
                className="form-control"
                style={{ maxWidth: 280 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  patch({ name });
                  renamingRef.current = false;
                  setRenaming(false);
                }}
              >
                Save Name
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  renamingRef.current = false;
                  setRenaming(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn btn-outline-primary"
              onClick={() => {
                renamingRef.current = true;
                setRenaming(true);
              }}
            >
              Rename
            </button>
          )}

          <button
            className="btn btn-outline-secondary"
            onClick={() => patch({ gatewayEnabled: !d.gatewayEnabled })}
          >
            {d.gatewayEnabled ? "Disable Gateway" : "Enable Gateway"}
          </button>

          <button className="btn btn-outline-secondary" onClick={() => window.open("/send", "_self")}>
            Send SMS
          </button>

          {d.revokedAt ? (
            <span className="badge text-bg-danger">Revoked</span>
          ) : (
            <button className="btn btn-outline-danger" onClick={unpair}>
              Unpair Device
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
