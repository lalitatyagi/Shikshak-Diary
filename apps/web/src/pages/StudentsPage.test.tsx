import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { StudentsPage } from "./StudentsPage";

vi.mock("../api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("../auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Priya",
      email: "teacher@demo.local",
      role: "CLASS_TEACHER",
    },
    ready: true,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    completeRegistration: vi.fn(),
    logout: vi.fn(),
  }),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/classes/class_1/students"]}>
        <Routes>
          <Route path="/classes/:classId/students" element={<StudentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentsPage CSV import", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (String(path).includes("/students/import")) {
        return {
          imported: 2,
          failed: 1,
          errors: [{ row: 3, message: "Invalid rollNumber" }],
          students: [
            {
              id: "s1",
              schoolId: "sch1",
              name: "Aarav Sharma",
              rollNumber: 1,
              parentContact: null,
            },
            {
              id: "s2",
              schoolId: "sch1",
              name: "Ananya Verma",
              rollNumber: 2,
              parentContact: "9800000002",
            },
          ],
        };
      }
      return {
        items: [],
        page: 1,
        pageSize: 40,
        total: 0,
        totalPages: 0,
      };
    });
  });

  it("shows import for class teachers and posts CSV text", async () => {
    renderPage();

    await screen.findByText(/No students yet/i);
    fireEvent.click(screen.getByRole("button", { name: /Import students/i }));

    const area = screen.getByPlaceholderText(/rollNumber,name/);
    fireEvent.change(area, {
      target: {
        value: "rollNumber,name\n1,Aarav Sharma\n2,Ananya Verma\n",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/classes/class_1/students/import",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByText(/Imported/i)).toBeTruthy();
      expect(screen.getByText(/Row 3: Invalid rollNumber/)).toBeTruthy();
    });
  });
});
