import { useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import RelativeTime from "../components/RelativeTime";

type Health = {
  latency: { p50: number | null; p95: number | null; max: number | null; samples: number };
  queue: { queued: number; sending: number; stuck: number; oldestQueuedAgeMs: number | null };
  devices: {
    total: number;
    fresh: number;
    ready: number;
    stale: number;
    offline: number;
    blocked: number;
    revoked: number;
  };
  deviceRows: {
    id: string;
    name: string;
    state: string;
    heartbeatAgeMs: number;
    gatewayEnabled: boolean;
    serviceRunning: boolean | null;
    smsPermission: string | null;
    simCount: number;
  }[];
  failures: { reason: string; count: number }[];
  volume: { day: string; sent: number; failed: number }[];
};

const FAILURE_LABEL: Record<string, string> = {
  NO_SIGNAL: "No signal",
  SEND_FAILED: "Send failed",
  NO_SIM: "No SIM",
  PERMISSION_DENIED: "Permission denied",
  INVALID_NUMBER: "Invalid number",
  UNKNOWN: "Unknown failure",
  UNCLASSIFIED: "Unclassified failure",
};

const STATE_TONE: Record<string, string> = {
  ready: "success",
  offline: "secondary",
  stale: "warning",
  revoked: "danger",
  unknown: "info",
};

function ms(value: number | null): string {
  if (value === null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${Math.round(value / 1000)}s`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)}m`;
  return `${Math.round(value / 3_600_000)}h`;
}

export default function HealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");

  function load() {
    api
      .get<Health>("/dashboard/health")
      .then(setData)
      .catch((e) => setError(e.message));
  }

  const { refreshedAt, refresh } = usePolling(load, 15000);

  if (!data) {
    return (
      <div>
        <h2 className="h4 mb-4">Health</h2>
        {error ? (
          <div className="alert alert-danger py-2 small">{error}</div>
        ) : (
          <p className="text-secondary">Loading health…</p>
        )}
      </div>
    );
  }

  const maxVolume = Math.max(1, ...data.volume.map((v) => Math.max(v.sent, v.failed)));

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h4 mb-0">Health</h2>
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

      <h3 className="h5 mb-3">Queue</h3>
      <div className="row g-3 mb-4">
        {[
          { label: "Queued", value: data.queue.queued, tone: "secondary" },
          { label: "Sending", value: data.queue.sending, tone: "info" },
          { label: "Stuck", value: data.queue.stuck, tone: data.queue.stuck > 0 ? "danger" : "success" },
          {
            label: "Oldest Queued",
            value: ms(data.queue.oldestQueuedAgeMs),
            tone: "primary",
          },
        ].map((s) => (
          <div className="col-6 col-lg-3" key={s.label}>
            <div className="card ssmmss-card h-100">
              <div className="card-body py-3">
                <div className={`ssmmss-stat fs-2 text-${s.tone}`}>{s.value}</div>
                <div className="text-secondary small text-uppercase mt-1">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.queue.stuck > 0 && (
        <div className="alert alert-danger py-2 small" role="alert">
          {data.queue.stuck} message(s) have been sending for over 2 minutes. They are requeued
          automatically on the next poll.
        </div>
      )}

      <h3 className="h5 mb-3">Delivery latency</h3>
      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-4">
              <div className={`ssmmss-stat fs-3 ${data.latency.p50 === null ? "text-secondary fs-5" : "text-success"}`}>
                {ms(data.latency.p50)}
              </div>
              <div className="text-secondary small text-uppercase">p50</div>
            </div>
            <div className="col-4">
              <div className={`ssmmss-stat fs-3 ${data.latency.p95 === null ? "text-secondary fs-5" : "text-warning"}`}>
                {ms(data.latency.p95)}
              </div>
              <div className="text-secondary small text-uppercase">p95</div>
            </div>
            <div className="col-4">
              <div className={`ssmmss-stat fs-3 ${data.latency.max === null ? "text-secondary fs-5" : "text-danger"}`}>
                {ms(data.latency.max)}
              </div>
              <div className="text-secondary small text-uppercase">max</div>
            </div>
          </div>
          <p className="text-secondary small mt-3 mb-0">
            Queue-to-sent time across {data.latency.samples} delivered message(s).
          </p>
        </div>
      </div>

      <h3 className="h5 mb-3">Devices</h3>
      <div className="card ssmmss-card mb-3">
        <div className="card-body">
          <div className="row text-center">
            {[
              { label: "Paired", value: data.devices.total, tone: "primary" },
              { label: "Ready", value: data.devices.ready, tone: "success" },
              { label: "Stale", value: data.devices.stale, tone: "warning" },
              { label: "Offline", value: data.devices.offline, tone: "secondary" },
              { label: "Blocked", value: data.devices.blocked, tone: "info" },
              { label: "Revoked", value: data.devices.revoked, tone: "danger" },
            ].map((s) => (
              <div className="col" key={s.label}>
                <div className={`ssmmss-stat fs-3 text-${s.tone}`}>{s.value}</div>
                <div className="text-secondary small text-uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.deviceRows.length > 0 && (
        <div className="card ssmmss-card mb-4">
          <div className="table-responsive">
            <div className="table-responsive"><table className="table align-middle mb-0 ssmmss-table">
              <thead className="table-light">
                <tr>
                  <th scope="col">Phone</th>
                  <th scope="col">State</th>
                  <th scope="col">Heartbeat</th>
                  <th scope="col">Gateway</th>
                  <th scope="col">Service</th>
                  <th scope="col">SMS perm</th>
                  <th scope="col">SIMs</th>
                </tr>
              </thead>
              <tbody>
                {data.deviceRows.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>
                      <span className={`badge text-bg-${STATE_TONE[d.state] ?? "secondary"}`}>
                        {d.state}
                      </span>
                    </td>
                    <td className="text-secondary small">{ms(d.heartbeatAgeMs)} ago</td>
                    <td>
                      <span className={`badge text-bg-${d.gatewayEnabled ? "success" : "danger"}`}>
                        {d.gatewayEnabled ? "on" : "off"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge text-bg-${d.serviceRunning === true ? "success" : "secondary"}`}
                      >
                        {d.serviceRunning === true ? "running" : "stopped"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge text-bg-${d.smsPermission === "granted" ? "success" : "danger"}`}
                      >
                        {d.smsPermission ?? "unknown"}
                      </span>
                    </td>
                    <td>{d.simCount}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      <h3 className="h5 mb-3">Last 7 days</h3>
      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-end gap-2" style={{ height: 120 }}>
            {data.volume.map((v) => (
              <div className="flex-fill text-center" key={v.day}>
                <div className="d-flex flex-column-reverse gap-1" style={{ height: 90 }}>
                  <div
                    className="bg-danger rounded"
                    style={{ height: `${(v.failed / maxVolume) * 100}%`, minHeight: v.failed ? 4 : 0 }}
                    title={`${v.failed} failed`}
                  />
                  <div
                    className="bg-success rounded"
                    style={{ height: `${(v.sent / maxVolume) * 100}%`, minHeight: v.sent ? 4 : 0 }}
                    title={`${v.sent} sent`}
                  />
                </div>
                <div className="text-secondary small mt-1">{v.day.slice(5)}</div>
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
                <span>{FAILURE_LABEL[f.reason] ?? f.reason}</span>
                <span className="badge text-bg-danger">{f.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
