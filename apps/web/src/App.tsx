import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { LoginPage } from "./pages/LoginPage";
import { ClassesPage } from "./pages/ClassesPage";
import { TickGridPage } from "./pages/TickGridPage";
import { DefaultersPage } from "./pages/DefaultersPage";
import { StudentsPage } from "./pages/StudentsPage";
import { StudentReportPage } from "./pages/StudentReportPage";
import { ParentReportPage } from "./pages/ParentReportPage";
import { HealthPage } from "./pages/HealthPage";
import type { ReactNode } from "react";

function Protected({ children }: { children: ReactNode }) {
  const { ready, isAuthenticated } = useAuth();
  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <p className="text-[var(--muted)]">Loading…</p>
      </main>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/p/:token" element={<ParentReportPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <ClassesPage />
            </Protected>
          }
        />
        <Route
          path="/classes/:classId/grid"
          element={
            <Protected>
              <TickGridPage />
            </Protected>
          }
        />
        <Route
          path="/classes/:classId/defaulters"
          element={
            <Protected>
              <DefaultersPage />
            </Protected>
          }
        />
        <Route
          path="/classes/:classId/students"
          element={
            <Protected>
              <StudentsPage />
            </Protected>
          }
        />
        <Route
          path="/classes/:classId/students/:studentId/report"
          element={
            <Protected>
              <StudentReportPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
