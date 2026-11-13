import os from "node:os";

/**
 * Picks the address a phone on the same network can reach.
 * Link-local (169.254.x) and virtual adapters are deprioritised.
 */
export function lanAddress(): string | null {
  const nets = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (net.address.startsWith("169.254.")) continue;
      candidates.push(net.address);
    }
  }

  if (candidates.length === 0) return null;

  // Prefer a home/office LAN range over virtual adapters (Hyper-V, VirtualBox).
  const score = (ip: string) => {
    if (ip.startsWith("192.168.")) return 0;
    if (ip.startsWith("10.")) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 3;
  };

  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0];
}

/** The URL a phone should use to reach this API. */
export function lanUrl(port: number): string {
  const address = lanAddress();
  return address ? `http://${address}:${port}` : `http://localhost:${port}`;
}
