import dgram from "node:dgram";
import { lanUrl } from "./network.js";

export const DISCOVERY_PORT = 41234;
export const DISCOVERY_MAGIC = "ssmmss-discovery";

/**
 * Answers a UDP broadcast so any phone on the LAN can find this API without
 * the user typing an IP address. Replies with the API's reachable URL.
 */
export function startDiscoveryResponder(apiPort: number): dgram.Socket {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("message", (message, remote) => {
    if (message.toString().trim() !== DISCOVERY_MAGIC) return;

    const payload = Buffer.from(
      JSON.stringify({ service: "ssmmss", url: lanUrl(apiPort) })
    );
    socket.send(payload, remote.port, remote.address, (err) => {
      if (err) console.warn("discovery reply failed", err);
    });
  });

  socket.on("error", (err) => {
    // Another instance may already hold the port — discovery is optional.
    console.warn("discovery responder error", err.message);
    socket.close();
  });

  socket.bind(DISCOVERY_PORT);
  return socket;
}
