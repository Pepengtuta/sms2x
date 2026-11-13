export interface ExistingDevice {
  id: string;
  userId: string;
  revokedAt: Date | null;
}

export interface PairingPlan {
  /** Live devices held by another account for the same physical phone. */
  revokeIds: string[];
  /** This account's existing row for the same phone, so it is reused not duplicated. */
  reuseId: string | null;
}

/**
 * Decides what happens when a phone pairs.
 *
 * A phone belongs to one account at a time. If another account already holds it,
 * their access is revoked so their token stops working and their dashboard does
 * not keep showing a phone that is no longer theirs.
 */
export function planPairing(existing: ExistingDevice[], userId: string): PairingPlan {
  const live = existing.filter((d) => !d.revokedAt);
  return {
    revokeIds: live.filter((d) => d.userId !== userId).map((d) => d.id),
    // Include an already-revoked row of this account so re-pairing restores it
    // instead of leaving a duplicate behind.
    reuseId: existing.find((d) => d.userId === userId)?.id ?? null,
  };
}
