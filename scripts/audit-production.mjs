#!/usr/bin/env node
/**
 * Production dependency audit for CI.
 *
 * GHSA-mrhx-c7xc-m3w5 (zod) currently has no patched Zod 3.x release; the
 * upstream fix landed in Zod 4.6.6 only. We stay on Zod 3 until a planned
 * migration, and ignore that single advisory so CI still catches other highs.
 */
import { execSync } from "node:child_process";

const ALLOWED_HIGH = new Set(["GHSA-MRHX-C7XC-M3W5"]);

let report;
try {
  const raw = execSync("npm audit --json --omit=dev --audit-level=high", {
    encoding: "utf8",
    shell: true,
  });
  report = JSON.parse(raw);
} catch (error) {
  const stdout =
    error && typeof error === "object" && "stdout" in error
      ? String(error.stdout ?? "")
      : "";
  if (!stdout.trim()) {
    console.error(error);
    process.exit(1);
  }
  report = JSON.parse(stdout);
}

const vulns = report.vulnerabilities ?? {};
const blockers = [];

for (const [name, entry] of Object.entries(vulns)) {
  const severity = String(entry.severity ?? "").toLowerCase();
  if (severity !== "high" && severity !== "critical") continue;

  const via = Array.isArray(entry.via) ? entry.via : [];
  const ids = via
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item) {
        if ("url" in item && item.url) return String(item.url);
        if ("source" in item) return String(item.source);
      }
      return "";
    })
    .filter(Boolean);

  const ghsaIds = ids
    .map((id) => {
      const match = String(id).match(/GHSA-[a-z0-9-]+/i);
      return match ? match[0].toUpperCase() : "";
    })
    .filter(Boolean);

  const onlyAllowed =
    ghsaIds.length > 0 && ghsaIds.every((id) => ALLOWED_HIGH.has(id));

  if (!onlyAllowed) {
    blockers.push({ name, severity, via: ghsaIds.length ? ghsaIds : ids });
  } else {
    console.log(
      `Ignoring allowed ${severity} advisory for ${name}: ${ghsaIds.join(", ")}`,
    );
  }
}

if (blockers.length > 0) {
  console.error("Production audit failed:");
  for (const row of blockers) {
    console.error(`- ${row.name} (${row.severity}): ${row.via.join(", ")}`);
  }
  process.exit(1);
}

console.log("Production audit passed (with documented allowlist).");
