import os from "node:os";

/**
 * Picks the address a phone on the same network can reach.
 * Link-local (169.254.x) and virtual adapters are deprioritised.
 */
export function lanAddress(): string | null {
  const nets = os.networkInterfaces();
  const candidates: { ip: string; virtual: boolean }[] = [];

  for (const name of Object.keys(nets)) {
    const virtualIface = /virtual|vbox|vmware|hyper-v|vethernet|docker|wsl/i.test(name);
    for (const net of nets[name] ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (net.address.startsWith("169.254.")) continue;
      const virtual = virtualIface || net.address.startsWith("192.168.56.");
      candidates.push({ ip: net.address, virtual });
    }
  }

  if (candidates.length === 0) return null;

  // Prefer a real home/office LAN adapter over virtual adapters (Hyper-V, VirtualBox).
  const score = ({ ip, virtual }: { ip: string; virtual: boolean }) => {
    const base = ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
    return (virtual ? 10 : 0) + base;
  };

  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0].ip;
}

/** The URL a phone should use to reach this API. */
export function lanUrl(port: number): string {
  const address = lanAddress();
  return address ? `http://${address}:${port}` : `http://localhost:${port}`;
}
