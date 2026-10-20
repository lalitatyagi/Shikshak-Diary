import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterPage } from "./RegisterPage";

const register = vi.fn();
const navigate = vi.fn();

vi.mock("../auth", () => ({
  useAuth: () => ({
    register,
    completeRegistration: vi.fn(),
    isAuthenticated: false,
    ready: true,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("RegisterPage", () => {
  beforeEach(() => {
    register.mockReset();
    navigate.mockReset();
    register.mockResolvedValue({
      status: "otp_sent",
      registrationId: "reg_1",
      phone: "+91******10",
      devCode: "123456",
    });
  });

  it("submits name, email, phone, and password then goes to OTP", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Neha Iyer" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "neha@school.local" },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "9876543210" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Password1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(
        "Neha Iyer",
        "neha@school.local",
        "Password1!",
        "9876543210",
      );
      expect(navigate).toHaveBeenCalledWith("/verify-phone", {
        state: {
          registrationId: "reg_1",
          phone: "+91******10",
          devCode: "123456",
        },
      });
    });
  });
});
