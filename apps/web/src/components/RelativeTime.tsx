import { useEffect, useState } from "react";

/** Shows how long ago something happened, ticking every second. */
export default function RelativeTime({ at, prefix = "updated" }: { at: number; prefix?: string }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!at) return null;
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  return (
    <span className="text-secondary small">
      {prefix} {seconds < 2 ? "just now" : `${seconds}s ago`}
    </span>
  );
}
