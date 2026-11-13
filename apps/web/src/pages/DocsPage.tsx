import { useEffect, useState } from "react";
import { api } from "../lib/api";
import CopyButton from "../components/CopyButton";

type Method = "GET" | "POST" | "PATCH";

type Endpoint = {
  method: Method;
  path: string;
  summary: string;
  note?: string;
  body?: Record<string, unknown>;
  response: Record<string, unknown>;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/v1/messages/send",
    summary: "Send an SMS",
    note: "deviceId and simId pick a specific phone and SIM. Leave them out and ssmmss picks one.",
    body: { to: "+639XXXXXXXXX", message: "Hello from ssmmss" },
    response: { id: "b1f2c3d4-...", status: "queued" },
  },
  {
    method: "GET",
    path: "/v1/messages/{id}",
    summary: "Check a message",
    note: "sent means the carrier took it — not that the handset received it.",
    response: { id: "b1f2c3d4-...", to: "+639XXXXXXXXX", status: "sent", sentAt: 1730000000 },
  },
  {
    method: "GET",
    path: "/v1/devices",
    summary: "List your phones",
    note: "ready: true means that phone can send right now.",
    response: { devices: [{ id: "d1...", name: "Xiaomi 23021RAAEG", status: "online", ready: true, isDefault: true }] },
  },
  {
    method: "GET",
    path: "/v1/devices/{id}/sims",
    summary: "List the SIM cards on a phone",
    response: { sims: [{ id: "s1...", slotIndex: 0, carrierName: "TNT", name: "TNT", enabled: true, isDefault: true }] },
  },
  {
    method: "POST",
    path: "/v1/otp/send",
    summary: "Send a one-time code",
    note: "The code arrives by SMS. This endpoint never returns it.",
    body: { to: "+639XXXXXXXXX" },
    response: { id: "o1...", messageId: "m1...", status: "queued", expiresAt: 1730000000 },
  },
  {
    method: "POST",
    path: "/v1/otp/verify",
    summary: "Check a code",
    note: "Codes expire after 5 minutes and allow 5 attempts.",
    body: { to: "+639XXXXXXXXX", code: "123456" },
    response: { verified: true },
  },
];

const ERRORS = [
  ["VALIDATION", "400", "Missing or invalid field."],
  ["UNAUTHORIZED", "401", "Key missing, invalid or revoked."],
  ["NOT_FOUND", "404", "Not found for this account."],
  ["RATE_LIMITED", "429", "Too many requests. Wait retryAfterSeconds."],
  ["NO_DEVICE", "503", "No phone available to send right now."],
  ["INTERNAL", "500", "Unexpected server error."],
];

const METHOD_TONE: Record<Method, string> = {
  GET: "info",
  POST: "primary",
  PATCH: "warning",
};

function Block({ title, value }: { title: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="text-secondary small text-uppercase">{title}</span>
        <CopyButton text={value} />
      </div>
      <pre className="bg-light border rounded p-3 mb-0 ssmmss-mono small">
        <code>{value}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    api
      .get<{ lanUrl: string }>("/server-info")
      .then((r) => setBaseUrl(r.lanUrl))
      .catch(() => setBaseUrl(window.location.origin));
  }, []);

  const curl = `curl -X POST "${baseUrl}/v1/messages/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"+639XXXXXXXXX","message":"Hello from ssmmss"}'`;

  const js = `const res = await fetch("${baseUrl}/v1/messages/send", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.SMS_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ to: "+639XXXXXXXXX", message: "Hello" }),
});

const { id, status } = await res.json();
console.log(id, status); // "b1f2c3d4-..." "queued"`;

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 className="h4 mb-4">API</h2>

      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="text-secondary small text-uppercase">Base URL</span>
                <CopyButton text={baseUrl} />
              </div>
              <code className="ssmmss-mono">{baseUrl || "…"}</code>
            </div>
            <div className="col-md-6">
              <div className="text-secondary small text-uppercase mb-1">Auth</div>
              <code className="ssmmss-mono">Authorization: Bearer YOUR_API_KEY</code>
            </div>
          </div>

          <p className="small mb-0">
            Create a key in the <strong>API Keys</strong> tab. Then send:
          </p>
        </div>
      </div>

      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <Block title="cURL" value={curl} />
          <Block title="JavaScript" value={js} />
        </div>
      </div>

      <h3 className="h5 mb-3">Endpoints</h3>
      <div className="card ssmmss-card mb-3">
        <div className="table-responsive">
          <div className="table-responsive"><table className="table align-middle mb-0 ssmmss-table">
            <thead className="table-light">
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Path</th>
                <th scope="col">Does</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path + e.method}>
                  <td>
                    <span className={`badge text-bg-${METHOD_TONE[e.method]}`}>{e.method}</span>
                  </td>
                  <td className="ssmmss-mono">{e.path}</td>
                  <td>{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>

      {ENDPOINTS.map((e) => (
        <details className="card ssmmss-card ssmmss-disclosure mb-2" key={e.path + e.method}>
          <summary className="card-body">
            {/* inline-flex keeps the native disclosure marker on the same line */}
            <div className="d-inline-flex align-items-center gap-2 w-100">
              <span className={`badge text-bg-${METHOD_TONE[e.method]}`}>{e.method}</span>
              <code className="ssmmss-mono">{e.path}</code>
              <span className="text-secondary small ms-auto">{e.summary}</span>
            </div>
          </summary>
          <div className="card-body pt-0">
            {e.note && <p className="small text-secondary">{e.note}</p>}
            {e.body && <Block title="Request" value={JSON.stringify(e.body, null, 2)} />}
            <Block title="Response" value={JSON.stringify(e.response, null, 2)} />
          </div>
        </details>
      ))}

      <h3 className="h5 mb-3 mt-4">Errors</h3>
      <div className="card ssmmss-card mb-4">
        <div className="card-body">
          <p className="small mb-2">
            <code>{'{ "error": { "code": "...", "message": "..." } }'}</code>. Rate-limited
            responses also include <code>retryAfterSeconds</code>.
          </p>
          <div className="table-responsive">
            <div className="table-responsive"><table className="table table-sm align-middle mb-0 ssmmss-table">
              <thead className="table-light">
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">HTTP</th>
                  <th scope="col">Means</th>
                </tr>
              </thead>
              <tbody>
                {ERRORS.map(([code, http, means]) => (
                  <tr key={code}>
                    <td className="ssmmss-mono">{code}</td>
                    <td>{http}</td>
                    <td>{means}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>

      <p className="small text-secondary mb-4">
        You are responsible for recipient consent, lawful use, your phone, SIM, carrier plan and
        applicable carrier terms.
      </p>
    </div>
  );
}
