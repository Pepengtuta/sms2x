import { useEffect, useState } from "react";
import { api } from "../lib/api";
import CopyButton from "../components/CopyButton";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");

  function load() {
    api
      .get<{ apiKeys: ApiKey[] }>("/dashboard/api-keys")
      .then((r) => setKeys(r.apiKeys))
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSecret("");
    try {
      const r = await api.post<{ secret: string }>("/dashboard/api-keys", { name });
      setSecret(r.secret);
      setName("");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function revoke(id: string) {
    try {
      await api.post(`/dashboard/api-keys/${id}/revoke`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2 className="h4 mb-4">API Keys</h2>

      {error && (
        <div className="alert alert-danger py-2 small" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={create} className="card ssmmss-card mb-4" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <label className="form-label small" htmlFor="key-name">
            Key name <span className="text-secondary">(optional)</span>
          </label>
          <div className="d-flex gap-2">
            <input
              id="key-name"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Web App"
            />
            <button type="submit" className="btn btn-primary text-nowrap">
              Create Key
            </button>
          </div>
        </div>
      </form>

      {secret && (
        <div className="alert alert-success" role="alert">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h4 className="h6 mb-0">Key created</h4>
            <CopyButton text={secret} />
          </div>
          <p className="small mb-2">
            Copy this secret now — it is shown only once.
          </p>
          <code className="ssmmss-mono ssmmss-break d-block p-2 bg-white border rounded">
            {secret}
          </code>
        </div>
      )}

      <div className="card ssmmss-card">
        <div className="table-responsive">
          <div className="table-responsive"><table className="table align-middle mb-0 ssmmss-table">
            <thead className="table-light">
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Prefix</th>
                <th scope="col">Created</th>
                <th scope="col">Last Used</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-4">
                    No API keys yet.
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="ssmmss-mono">{k.keyPrefix}</td>
                  <td className="text-secondary small">
                    {new Date(k.createdAt).toLocaleString()}
                  </td>
                  <td className="text-secondary small">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                  </td>
                  <td className="text-end">
                    {k.revokedAt ? (
                      <span className="badge text-bg-secondary">Revoked</span>
                    ) : (
                      <button
                        onClick={() => revoke(k.id)}
                        className="btn btn-outline-danger btn-sm"
                        type="button"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
