import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api";
import { TickGridPage } from "./TickGridPage";

vi.mock("../api", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    ApiError,
    apiFetch: vi.fn(),
  };
});

const grid = {
  class: { id: "class_1", name: "8-B", academicYear: "2025-26" },
  defaultSubjectId: "subject_1",
  students: [
    {
      id: "student_1",
      schoolId: "school_1",
      name: "Aarav Sharma",
      rollNumber: 1,
      parentContact: null,
    },
  ],
  tasks: [
    {
      id: "task_1",
      title: "Exercise",
      type: "DAILY_HOMEWORK",
      assignedOn: "2026-10-03",
      dueOn: "2026-10-03",
    },
  ],
  statuses: [
    {
      id: "status_1",
      taskId: "task_1",
      studentId: "student_1",
      status: "PENDING",
      version: 1,
      marks: null,
      partsDone: null,
      remark: null,
    },
  ],
};

function renderGrid() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/classes/class_1/grid"]}>
        <Routes>
          <Route path="/classes/:classId/grid" element={<TickGridPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TickGridPage status errors", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows the update error and refetches the grid", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (String(path).includes("/grid")) {
        return grid;
      }
      throw new ApiError(
        "Status was updated elsewhere — refresh and retry",
        409,
      );
    });

    renderGrid();

    const cell = await screen.findByRole("button", {
      name: "Aarav Sharma Exercise",
    });
    cell.click();

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /updated elsewhere/i,
    );

    await waitFor(() => {
      const gridCalls = vi
        .mocked(apiFetch)
        .mock.calls.filter((call) => String(call[0]).includes("/grid"));
      expect(gridCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("sends the second tap with the version returned by the first save", async () => {
    let releaseFirst: (value: unknown) => void = () => undefined;
    const firstSave = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const putBodies: Array<{ status: string; version: number }> = [];

    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (String(path).includes("/grid")) {
        return grid;
      }
      const body = JSON.parse(String(init?.body)) as {
        status: string;
        version: number;
      };
      putBodies.push(body);
      if (putBodies.length === 1) {
        return firstSave;
      }
      return {
        ...grid.statuses[0],
        status: body.status,
        version: body.version + 1,
      };
    });

    renderGrid();
    const cell = await screen.findByRole("button", {
      name: "Aarav Sharma Exercise",
    });
    cell.click();
    await waitFor(() => {
      expect(cell.textContent).toMatch(/Done/);
    });
    cell.click();

    await waitFor(() => {
      expect(putBodies).toHaveLength(1);
    });
    expect(putBodies[0]).toMatchObject({ status: "DONE", version: 1 });

    releaseFirst({
      ...grid.statuses[0],
      status: "DONE",
      version: 2,
    });

    await waitFor(() => {
      expect(putBodies).toHaveLength(2);
    });
    expect(putBodies[1]).toMatchObject({ status: "NOT_DONE", version: 2 });
  });
});
