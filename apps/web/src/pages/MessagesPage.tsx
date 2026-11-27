import { FormEvent, useEffect, useState } from "react";
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

type DeviceOption = {
  id: string;
  name: string;
  status: string;
};

type Thread = {
  peer: string;
  contactName?: string;
  lastBody: string;
  lastDirection: string;
  lastStatus: string;
  lastAt: number;
  deviceId?: string;
  deviceName?: string;
};

type ThreadMessage = {
  id: string;
  direction: string;
  from?: string;
  to: string;
  contactName?: string;
  body: string;
  status: string;
  errorMessage?: string;
  failureReason?: string;
  createdAt: number;
};

const TONE: Record<string, string> = {
  sent: "success",
  received: "primary",
  failed: "danger",
  sending: "info",
  queued: "secondary",
};

const FILTERS = ["all", "queued", "sending", "sent", "failed"] as const;

function maskPhone(phone?: string): string {
  if (!phone || phone.length <= 4) return phone || "—";
  return "•".repeat(Math.max(0, phone.length - 4)) + phone.slice(-4);
}

function threadKey(t: { peer: string; deviceId?: string }) {
  return `${t.deviceId ?? "unassigned"}::${t.peer}`;
}

export default function MessagesPage() {
  const [view, setView] = useState<"inbox" | "logs">("inbox");

  // Inbox state
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ peer: string; deviceId?: string } | null>(null);
  const [conversation, setConversation] = useState<ThreadMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // Logs state
  const [messages, setMessages] = useState<Message[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  useEffect(() => {
    api
      .get<{ devices: DeviceOption[] }>("/dashboard/devices")
      .then((r) => setDevices(r.devices))
      .catch(() => {});
  }, []);

  function loadInbox() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (deviceFilter) params.set("deviceId", deviceFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";

    api
      .get<{ threads: Thread[] }>(`/dashboard/threads${qs}`)
      .then((r) => {
        setThreads(r.threads);
        if (!selected && r.threads.length > 0) {
          setSelected({ peer: r.threads[0].peer, deviceId: r.threads[0].deviceId });
        }
      })
      .catch(() => {});

    if (selected) {
      const devParam = encodeURIComponent(selected.deviceId ?? "unassigned");
      api
        .get<{ messages: ThreadMessage[] }>(
          `/dashboard/threads/${encodeURIComponent(selected.peer)}?deviceId=${devParam}`
        )
        .then((r) => setConversation(r.messages))
        .catch(() => {});
    }
  }

  function loadLogs() {
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

  function load() {
    if (view === "inbox") loadInbox();
    else loadLogs();
  }

  usePolling(load, view === "inbox" ? 5000 : 15000);

  useEffect(() => {
    load();
  }, [view, selected?.peer, selected?.deviceId, search, deviceFilter, page, filter]);

  async function handleSendReply(e: FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      await api.post("/dashboard/messages/send", {
        to: selected.peer,
        message: reply.trim(),
        ...(selected.deviceId ? { deviceId: selected.deviceId } : {}),
      });
      setReply("");
      loadInbox();
    } catch (err: any) {
      setSendError(err?.message || "Failed to queue reply");
    } finally {
      setSending(false);
    }
  }

  const activeThread = selected
    ? threads.find((t) => threadKey(t) === threadKey(selected))
    : undefined;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center gap-3">
          <h2 className="h4 mb-0">Messages</h2>
          <div className="btn-group" role="group" aria-label="Messages view">
            <button
              type="button"
              onClick={() => setView("inbox")}
              className={`btn btn-sm ${view === "inbox" ? "btn-primary" : "btn-outline-secondary"}`}
            >
              Inbox
            </button>
            <button
              type="button"
              onClick={() => setView("logs")}
              className={`btn btn-sm ${view === "logs" ? "btn-primary" : "btn-outline-secondary"}`}
            >
              All Logs
            </button>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} type="button">
          Refresh
        </button>
      </div>

      {view === "inbox" ? (
        <div className="row g-3">
          <div className="col-md-4">
            <div className="card ssmmss-card">
              <div className="card-header bg-light d-flex flex-column gap-2">
                <select
                  className="form-select form-select-sm"
                  aria-label="Filter by phone"
                  value={deviceFilter}
                  onChange={(e) => {
                    setDeviceFilter(e.target.value);
                    setSelected(null);
                  }}
                >
                  <option value="">All phones</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.status})
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  className="form-control form-control-sm"
                  placeholder="Search number or contact..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="list-group list-group-flush" style={{ height: 480, overflowY: "auto" }}>
                {threads.length === 0 && (
                  <div className="p-4 text-center text-secondary small">
                    No conversations yet.
                  </div>
                )}
                {threads.map((t) => {
                  const isActive = selected ? threadKey(t) === threadKey(selected) : false;
                  return (
                    <button
                      key={threadKey(t)}
                      type="button"
                      onClick={() => setSelected({ peer: t.peer, deviceId: t.deviceId })}
                      className={`list-group-item list-group-item-action text-start ${
                        isActive ? "active" : ""
                      }`}
                    >
                      <div className="d-flex justify-content-between align-items-baseline">
                        <span className="fw-semibold text-truncate">
                          {t.contactName || t.peer}
                        </span>
                        <span
                          className={`badge ms-2 ${
                            isActive
                              ? "text-bg-light"
                              : t.lastDirection === "inbound"
                                ? "text-bg-primary"
                                : "text-bg-secondary"
                          }`}
                        >
                          {t.lastDirection === "inbound" ? "IN" : "OUT"}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mt-1">
                        <span className={`small ssmmss-mono text-truncate ${isActive ? "text-light" : "text-secondary"}`}>
                          {t.contactName ? t.peer : ""}
                        </span>
                        <span className={`badge ${isActive ? "text-bg-light" : "text-bg-secondary"}`}>
                          {t.deviceName || "Unassigned"}
                        </span>
                      </div>
                      <div className={`small text-truncate mt-1 ${isActive ? "text-light" : "text-secondary"}`}>
                        {t.lastBody}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="col-md-8">
            <div className="card ssmmss-card d-flex flex-column" style={{ height: 575 }}>
              {!selected ? (
                <div className="card-body d-flex align-items-center justify-content-center text-secondary">
                  Select a conversation to view messages.
                </div>
              ) : (
                <>
                  <div className="card-header bg-light d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-semibold">
                        {activeThread?.contactName || selected.peer}
                      </div>
                      <div className="small text-secondary ssmmss-mono">
                        {activeThread?.deviceName || "Default device"}
                        {activeThread?.contactName ? ` · ${selected.peer}` : ""}
                      </div>
                    </div>
                    <span className="small text-secondary">
                      {conversation.length} messages
                    </span>
                  </div>

                  <div className="card-body flex-grow-1" style={{ overflowY: "auto" }}>
                    {conversation.length === 0 && (
                      <div className="text-center text-secondary py-4 small">
                        No messages in this thread.
                      </div>
                    )}
                    {conversation.map((m) => {
                      const isInbound = m.direction === "inbound";
                      return (
                        <div
                          key={m.id}
                          className={`d-flex flex-column mb-3 ${isInbound ? "align-items-start" : "align-items-end"}`}
                        >
                          <div
                            className={`p-2 px-3 rounded ${
                              isInbound ? "bg-light border text-dark" : "bg-primary text-white"
                            }`}
                            style={{ maxWidth: "80%", whiteSpace: "pre-wrap" }}
                          >
                            {m.body}
                          </div>
                          <div className="small text-secondary mt-1 d-flex align-items-center gap-2">
                            <span>{new Date(m.createdAt).toLocaleString()}</span>
                            {!isInbound && (
                              <>
                                <span className={`badge text-bg-${TONE[m.status] ?? "secondary"}`}>
                                  {m.status}
                                </span>
                                <Link to={`/messages/${m.id}`} className="text-decoration-none">
                                  Details
                                </Link>
                              </>
                            )}
                          </div>
                          {m.failureReason && (
                            <div className="text-danger small">{m.failureReason}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={handleSendReply} className="card-footer bg-light">
                    {sendError && (
                      <div className="alert alert-danger py-1 px-2 small mb-2">{sendError}</div>
                    )}
                    <div className="input-group">
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        placeholder={`Reply via ${activeThread?.deviceName || "default phone"} to ${selected.peer}...`}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        maxLength={1600}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        type="submit"
                        disabled={sending || !reply.trim()}
                      >
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
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
              <table className="table table-hover align-middle mb-0 ssmmss-table">
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
              </table>
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
        </>
      )}
    </div>
  );
}
