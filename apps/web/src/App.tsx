import { useQuery } from "@tanstack/react-query";
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

export function App() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-sm tracking-wide text-[var(--muted)] uppercase">
        Portfolio project
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--accent)]">
        Classroom Tracker
      </h1>
      <p className="mt-3 text-base text-[var(--muted)]">
        Mobile-first homework and notebook tracking for physical classrooms.
      </p>

      <section className="mt-8 rounded-xl bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="text-lg font-medium">API health</h2>
        {healthQuery.isPending && (
          <p className="mt-2 text-sm text-[var(--muted)]">Checking…</p>
        )}
        {healthQuery.isError && (
          <p className="mt-2 text-sm text-red-700">
            API unreachable. Start the API (`npm run dev:api`) and Postgres
            (`npm run db:up`).
          </p>
        )}
        {healthQuery.data && (
          <dl className="mt-3 space-y-1 text-sm">
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
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Timestamp</dt>
              <dd>{new Date(healthQuery.data.timestamp).toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
