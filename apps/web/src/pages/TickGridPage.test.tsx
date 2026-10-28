import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      maxMarks: null,
      totalParts: null,
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

  afterEach(() => {
    cleanup();
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

    expect(await screen.findByText("Sat 3 Oct")).toBeTruthy();
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

  it("undo restores the previous status after a tap", async () => {
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
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.hasAttribute("disabled")).toBe(true);

    cell.click();
    await waitFor(() => {
      expect(cell.textContent).toMatch(/Done/);
    });
    expect(undo.hasAttribute("disabled")).toBe(false);

    fireEvent.click(undo);
    await waitFor(() => {
      expect(putBodies).toHaveLength(2);
    });
    expect(putBodies[0]).toMatchObject({ status: "DONE", version: 1 });
    expect(putBodies[1]).toMatchObject({ status: "PENDING", version: 2 });
    await waitFor(() => {
      expect(undo.hasAttribute("disabled")).toBe(true);
    });
  });

  it("undoes several taps in reverse order", async () => {
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
    const undo = screen.getByRole("button", { name: "Undo" });

    cell.click();
    await waitFor(() => {
      expect(cell.textContent).toMatch(/Done/);
    });
    cell.click();
    await waitFor(() => {
      expect(cell.textContent).toMatch(/Not/);
    });

    fireEvent.click(undo);
    await waitFor(() => {
      expect(cell.textContent).toMatch(/Done/);
    });
    expect(undo.hasAttribute("disabled")).toBe(false);

    fireEvent.click(undo);
    await waitFor(() => {
      expect(cell.textContent).toMatch(/—/);
    });
    expect(undo.hasAttribute("disabled")).toBe(true);
    expect(putBodies.map((body) => body.status)).toEqual([
      "DONE",
      "NOT_DONE",
      "DONE",
      "PENDING",
    ]);
  });

  it("opens a marks sheet for weekly tests and saves the score", async () => {
    const testGrid = {
      ...grid,
      tasks: [
        {
          id: "task_test",
          title: "Chapter 7",
          type: "WEEKLY_TEST" as const,
          assignedOn: "2026-10-03",
          dueOn: "2026-10-03",
          maxMarks: 50,
          totalParts: null,
        },
      ],
      statuses: [
        {
          id: "status_test",
          taskId: "task_test",
          studentId: "student_1",
          status: "PENDING" as const,
          version: 1,
          marks: null,
          partsDone: null,
          remark: null,
        },
      ],
    };

    const putBodies: Array<{
      status: string;
      marks?: number;
      version: number;
    }> = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (String(path).includes("/grid")) {
        return testGrid;
      }
      const body = JSON.parse(String(init?.body)) as {
        status: string;
        marks?: number;
        version: number;
      };
      putBodies.push(body);
      return {
        ...testGrid.statuses[0],
        status: body.status,
        marks: body.marks ?? null,
        version: body.version + 1,
      };
    });

    renderGrid();
    const cell = await screen.findByRole("button", {
      name: "Aarav Sharma Chapter 7",
    });
    fireEvent.click(cell);

    expect(
      await screen.findByRole("dialog", { name: "Enter marks" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("0–50"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));

    await waitFor(() => {
      expect(putBodies).toEqual([{ status: "DONE", marks: 40, version: 1 }]);
    });
  });
});
