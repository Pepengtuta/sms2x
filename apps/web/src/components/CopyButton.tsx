import { useEffect, useState } from "react";

/**
 * Copies text to the clipboard.
 *
 * The Clipboard API needs a secure context and can still be refused by the
 * browser, so fall back to the legacy selection trick, which works everywhere
 * — including over plain HTTP on a LAN address, which is how the dashboard is
 * usually opened.
 */
export default function CopyButton({
  text,
  label = "Copy",
  className = "btn btn-outline-secondary btn-sm",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    const legacyCopy = () => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          if (!legacyCopy()) throw new Error("copy failed");
        }
      } else if (!legacyCopy()) {
        throw new Error("copy failed");
      }
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      className={`${className} ${state === "failed" ? "btn-outline-danger" : ""}`}
      onClick={copy}
      title={state === "failed" ? "Copy was blocked by the browser — select the text manually" : undefined}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy blocked" : label}
    </button>
  );
}
