import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import RelativeTime from "../components/RelativeTime";

type Detail = {
  id: string;
  to: string;
  body: string;
  status: string;
  correlationId: string;
  errorMessage?: string;
  failureReason?: string;
  createdAt: number;
  claimedAt?: number;
  sendingAt?: number;
  sentAt?: number;
  failedAt?: number;
  device: { id: string; name: string } | null;
  sim: { id: string; carrierName: string; slotIndex: number; phoneNumber?: string } | null;
  apiKey: { id: string; name: string } | null;
};

const STATUS_TONE: Record<string, string> = {
  sent: "success",
  failed: "danger",
  sending: "info",
  queued: "secondary",
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

export default function MessageDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  function load() {
    api
      .get<Detail>(`/dashboard/messages/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }

  const { refreshedAt, refresh } = usePolling(load, 15000);

  if (!data) {
    return (
      <div>
        <h2 className="h4 mb-4">Message</h2>
        {error ? (
          <div className="alert alert-danger py-2 small">{error}</div>
        ) : (
          <p className="text-secondary">Loading message…</p>
        )}
        <Link to="/messages" className="btn btn-secondary btn-sm">
          Back to Messages
        </Link>
      </div>
    );
  }

  const stages = [
    { key: "queued", label: "Queued", at: data.createdAt },
    { key: "sending", label: "Sending", at: data.sendingAt ?? data.claimedAt },
    {
      key: data.status === "failed" ? "failed" : "sent",
      label: data.status === "failed" ? "Failed" : "Sent",
      at: data.status === "failed" ? data.failedAt : data.sentAt,
    },
  ];

  const currentIndex = stages.findIndex((s) => s.key === data.status);

  return (
    <div>
      <Link to="/messages" className="btn btn-secondary btn-sm mb-3">
        Back to Messages
      </Link>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Message</h2>
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

      <div className="alert alert-warning py-2 small" role="note">
        <strong>Sensitive detail.</strong> This view shows the full recipient and message body.
        Keep it private.
      </div>

      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-3">
            <div>
              <div className="ssmmss-mono fs-5">{data.to}</div>
              <div className="text-secondary small mt-1">
                {data.device?.name ?? "No device"}
                {data.sim ? ` · ${data.sim.carrierName} (slot ${data.sim.slotIndex + 1})` : ""}
                {data.apiKey ? ` · key "${data.apiKey.name}"` : " · dashboard"}
              </div>
            </div>
            <span className={`badge text-bg-${STATUS_TONE[data.status] ?? "secondary"}`}>
              {data.status}
            </span>
          </div>

          <pre className="ssmmss-mono border rounded bg-light p-3 mb-0" style={{ whiteSpace: "pre-wrap" }}>
            {data.body}
          </pre>

          {data.failureReason && (
            <div className="alert alert-danger py-2 small mt-3 mb-0">
              <strong>{FAILURE_LABEL[data.failureReason] ?? data.failureReason}</strong>
              {data.errorMessage ? ` — ${data.errorMessage}` : ""}
            </div>
          )}
        </div>
      </div>

      <h3 className="h5 mb-3">Lifecycle</h3>
      <ol className="list-group mb-4">
        {stages.map((stage, index) => {
          const state = index < currentIndex ? "completed" : index === currentIndex ? "current" : "pending";
          return (
            <li className="list-group-item d-flex justify-content-between align-items-center" key={stage.key}>
              <span>
                <strong>{stage.label}</strong>{" "}
                <span className={`badge text-bg-${state === "completed" ? "success" : state === "current" ? "info" : "secondary"}`}>
                  {state.toUpperCase()}
                </span>
              </span>
              <span className="text-secondary small">
                {stage.at ? new Date(stage.at).toLocaleString() : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      <h3 className="h5 mb-3">Identifiers</h3>
      <div className="card ssmmss-card mb-4">
        <div className="card-body ssmmss-mono small">
          <div className="mb-2">
            <span className="text-secondary">Message ID:</span> {data.id}
          </div>
          <div className="mb-2">
            <span className="text-secondary">Correlation ID:</span> {data.correlationId}
          </div>
          {data.sim?.phoneNumber && (
            <div className="mb-2">
              <span className="text-secondary">SIM number:</span> {data.sim.phoneNumber}
            </div>
          )}
          {data.device && (
            <div>
              <span className="text-secondary">Device:</span>{" "}
              <Link to={`/devices/${data.device.id}`}>{data.device.name}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
