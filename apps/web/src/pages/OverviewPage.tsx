import { useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import RelativeTime from "../components/RelativeTime";

type Summary = { total: number; sent: number; failed: number; devicesOnline: number };

export default function OverviewPage() {
  const [data, setData] = useState<Summary | null>(null);

  function load() {
    api.get<Summary>("/dashboard/summary").then(setData).catch(() => {});
  }

  const { refreshedAt, refresh } = usePolling(load, 15000);

  const stats = [
    { label: "Total Messages", value: data?.total, tone: "primary" },
    { label: "Sent", value: data?.sent, tone: "success" },
    { label: "Failed", value: data?.failed, tone: "danger" },
    { label: "Devices Online", value: data?.devicesOnline, tone: "info" },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h4 mb-0">Dashboard</h2>
        <div className="d-flex align-items-center gap-3">
          <RelativeTime at={refreshedAt} />
          <button className="btn btn-secondary btn-sm" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
      </div>

      <div className="row g-3">
        {stats.map((s) => (
          <div className="col-6 col-lg-3" key={s.label}>
            <div className="card ssmmss-card h-100">
              <div className="card-body">
                <div className={`ssmmss-stat text-${s.tone}`}>{s.value ?? "—"}</div>
                <div className="text-secondary small text-uppercase mt-1">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
