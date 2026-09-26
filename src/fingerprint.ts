import { createHash } from "node:crypto";

export function findingFingerprint(f: { path?: string | null; line?: number | null; title: string; body?: string }): string {
  return createHash("sha256")
    .update([f.path ?? "", f.line ?? "", f.title.trim().toLowerCase()].join("\n"))
    .digest("hex")
    .slice(0, 16);
}
