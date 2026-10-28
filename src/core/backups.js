// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Rolling backups: which versions of a book to keep. Storage lives in the UI layer.

export const BACKUP_KEEP = 10;
export const BACKUP_GAP_MS = 15 * 60 * 1000;

/**
 * Adds a backup to a newest-first list unless it matches the newest one,
 * or (without force) the newest is younger than BACKUP_GAP_MS. Returns the new list, or null for no change.
 */
export function withBackup(list, entry, { force = false, keep = BACKUP_KEEP } = {}) {
  const newest = list[0];
  if (newest && newest.raw === entry.raw) return null;
  if (!force && newest && Date.parse(entry.at) - Date.parse(newest.at) < BACKUP_GAP_MS) return null;
  return [entry, ...list].slice(0, keep);
}
