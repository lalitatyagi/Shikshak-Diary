import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  healthResponseSchema,
  type HealthResponse,
} from "@classroom-tracker/shared";

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health check failed with ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}

export function HealthPage() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Link to="/login" className="text-sm text-[var(--muted)] underline">
        ← Login
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-[var(--accent)]">
        API health
      </h1>
      {healthQuery.isPending && (
        <p className="mt-4 text-[var(--muted)]">Checking…</p>
      )}
      {healthQuery.isError && (
        <p className="mt-4 text-red-700">API unreachable.</p>
      )}
      {healthQuery.data && (
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Status</dt>
            <dd className="font-medium text-[var(--accent)]">
              {healthQuery.data.status}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Service</dt>
            <dd>{healthQuery.data.service}</dd>
          </div>
        </dl>
      )}
    </main>
  );
}
