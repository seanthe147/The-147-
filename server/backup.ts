// Nightly data backup for the three most critical tables:
// bookings, app_orders, and membership_subscriptions — plus
// supporting rows (membership_plans, customers).
//
// Backups are written as JSON files to ./backups/ in the project root.
// The last MAX_BACKUPS files are kept; older ones are pruned automatically.
// Each file is self-contained — you can open it in any text editor or
// import it back with a one-off script if you ever need to recover data.

import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";

// Stored outside the project workspace so backups are never mixed with
// source code and are not affected by deploys, file resets, or git operations.
const BACKUP_DIR = path.resolve("/home/runner/the147_backups");
const MAX_BACKUPS = 5; // keep the 5 most recent; oldest is overwritten on the 6th run

// The five tables that matter most.  Order controls JSON key order only.
const CRITICAL_TABLES = [
  "membership_plans",
  "membership_subscriptions",
  "bookings",
  "app_orders",
  "customers",
] as const;

export type BackupInfo = {
  filename: string;
  createdAt: string; // ISO string parsed from the filename
  sizeKb: number;
  rowCounts: Partial<Record<string, number>>;
};

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function makePool(): Pool {
  const raw = process.env.DATABASE_URL!;
  const url = raw.startsWith("postgresql+neon://")
    ? raw.replace("postgresql+neon://", "postgresql://")
    : raw;
  // Small pool — backups are low-priority background work.
  return new Pool({ connectionString: url, max: 2 });
}

function pruneOld() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".json"))
      .sort() // ISO timestamps sort lexicographically = chronologically
      .reverse(); // newest first
    for (const f of files.slice(MAX_BACKUPS)) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch { /* best effort */ }
    }
  } catch { /* best effort */ }
}

export async function runBackup(): Promise<{ filename: string; rowCounts: Record<string, number> }> {
  ensureDir();
  const pool = makePool();
  const now = new Date();
  // Filename-safe ISO timestamp — colons replaced with hyphens.
  const ts = now.toISOString().replace(/:/g, "-").replace(/\..+/, "");
  const filename = `backup_${ts}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  const snapshot: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  try {
    for (const table of CRITICAL_TABLES) {
      try {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        snapshot[table] = result.rows;
        rowCounts[table] = result.rows.length;
      } catch (err: any) {
        // One failed table must not abort the whole backup.
        console.error(`[Backup] Failed to dump table ${table}:`, err.message);
        snapshot[table] = [];
        rowCounts[table] = 0;
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }

  const payload = {
    exportedAt: now.toISOString(),
    tables: CRITICAL_TABLES,
    rowCounts,
    data: snapshot,
  };

  fs.writeFileSync(filepath, JSON.stringify(payload), "utf-8");
  pruneOld();
  return { filename, rowCounts };
}

export function listBackups(): BackupInfo[] {
  ensureDir();
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".json"))
      .sort()
      .reverse()
      .map((filename) => {
        const filepath = path.join(BACKUP_DIR, filename);
        const stat = fs.statSync(filepath);
        // Reconstruct ISO date from filename: backup_2024-01-15T12-00-00.json
        const rawTs = filename
          .replace("backup_", "")
          .replace(".json", "")
          .replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
        // Try to read row counts from the file header without loading all data
        let rowCounts: Record<string, number> = {};
        try {
          const raw = fs.readFileSync(filepath, "utf-8");
          const parsed = JSON.parse(raw);
          rowCounts = parsed.rowCounts ?? {};
        } catch { /* best effort */ }
        return {
          filename,
          createdAt: rawTs,
          sizeKb: Math.round(stat.size / 1024),
          rowCounts,
        };
      });
  } catch {
    return [];
  }
}

// Returns the absolute path to a backup file after validating the filename
// is safe (only backup_<timestamp>.json pattern allowed).
export function resolveBackupFile(filename: string): string | null {
  if (!/^backup_[\dT\-]+\.json$/.test(filename)) return null;
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return filepath;
}
