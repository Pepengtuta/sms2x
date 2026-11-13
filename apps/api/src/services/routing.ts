import { prisma } from "../plugins/prisma.js";

// A device that has not heartbeated within this window is treated as offline.
export const DEVICE_STALE_MS = 90_000;

export function isDeviceOnline(device: { status: string; gatewayEnabled: boolean; lastSeenAt: Date }, now = Date.now()): boolean {
  return device.status === "online" && device.gatewayEnabled && now - device.lastSeenAt.getTime() < DEVICE_STALE_MS;
}

export async function resolveRoute(
  userId: string,
  explicitDeviceId?: string,
  explicitSimId?: string
) {
  const now = Date.now();
  const onlineWhere = { userId, status: "online", gatewayEnabled: true, revokedAt: null };

  let device = null;

  if (explicitDeviceId) {
    device = await prisma.device.findFirst({
      where: { ...onlineWhere, id: explicitDeviceId },
    });
    if (device && !isDeviceOnline(device, now)) device = null;
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.defaultDeviceId) {
      device = await prisma.device.findFirst({
        where: { ...onlineWhere, id: user.defaultDeviceId },
      });
      if (device && !isDeviceOnline(device, now)) device = null;
    }
    if (!device) {
      const candidates = await prisma.device.findMany({
        where: onlineWhere,
        orderBy: { lastSeenAt: "desc" },
      });
      device = candidates.find((d) => isDeviceOnline(d, now)) ?? null;
    }
  }

  if (!device) return null;

  let sim = null;
  if (explicitSimId) {
    sim = await prisma.simCard.findFirst({
      where: { id: explicitSimId, deviceId: device.id, enabled: true }
    });
  } else {
    sim = await prisma.simCard.findFirst({
      where: { deviceId: device.id, isDefault: true, enabled: true }
    }) || await prisma.simCard.findFirst({
      where: { deviceId: device.id, enabled: true },
      orderBy: { slotIndex: "asc" }
    });
  }

  if (!sim) return null;

  return { device, sim };
}
