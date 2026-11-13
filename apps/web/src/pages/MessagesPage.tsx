import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";

type Message = {
  id: string;
  to: string;
  body: string;
  status: string;
  createdAt: number;
  errorMessage?: string;
  failureReason?: string;
};

const TONE: Record<string, string> = {
  sent: "success",
  failed: "danger",
  sending: "info",
  queued: "secondary",
};

const FILTERS = ["all", "queued", "sending", "sent", "failed"] as const;

function maskPhone(phone?: string): string {
  if (!phone || phone.length <= 4) return phone || "—";
  return "•".repeat(Math.max(0, phone.length - 4)) + phone.slice(-4);
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  function load() {
    api
      .get<{ messages: Message[]; pagination: { total: number } }>(
        `/dashboard/messages?page=${page}&status=${filter}`
      )
      .then((r) => {
        setMessages(r.messages);
        setTotal(r.pagination.total);
      })
      .catch(() => {});
  }

  usePolling(load, 15000);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h4 mb-0">Messages</h2>
        <button className="btn btn-secondary btn-sm" onClick={load} type="button">
          Refresh
        </button>
      </div>

      <div className="btn-group mb-3" role="group" aria-label="Message status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline-secondary"}`}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      <div className="card ssmmss-card">
        <div className="table-responsive">
          <div className="table-responsive"><table className="table table-hover align-middle mb-0 ssmmss-table">
            <thead className="table-light">
              <tr>
                <th scope="col">To</th>
                <th scope="col">Message</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-secondary py-4">
                    No messages yet.
                  </td>
                </tr>
              )}
              {messages.map((m) => (
                <tr key={m.id}>
                  <td className="ssmmss-mono">
                    <Link to={`/messages/${m.id}`} className="text-decoration-none">
                      {maskPhone(m.to)}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/messages/${m.id}`} className="text-decoration-none d-block">
                      <div className="text-truncate" style={{ maxWidth: 320 }}>
                        {m.body}
                      </div>
                    </Link>
                    {m.failureReason && (
                      <div className="text-danger small">{m.failureReason}</div>
                    )}
                    {m.errorMessage && !m.failureReason && (
                      <div className="text-danger small">{m.errorMessage}</div>
                    )}
                  </td>
                  <td>
                    <span className={`badge text-bg-${TONE[m.status] ?? "secondary"}`}>
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

      <div className="d-flex align-items-center gap-3 mt-3">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="btn btn-secondary btn-sm"
          type="button"
        >
          Previous
        </button>
        <span className="text-secondary small">
          Page {page} · {total} total
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page * 20 >= total}
          className="btn btn-secondary btn-sm"
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
