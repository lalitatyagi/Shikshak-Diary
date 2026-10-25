import { describe, expect, it } from "vitest";
import {
  defaulterWhatsAppMessage,
  toWhatsAppDigits,
  whatsappChatHref,
} from "./whatsapp.js";

describe("toWhatsAppDigits", () => {
  it("normalizes Indian mobiles to wa.me digits", () => {
    expect(toWhatsAppDigits("9876543210")).toBe("919876543210");
    expect(toWhatsAppDigits("+91 98765 43210")).toBe("919876543210");
    expect(toWhatsAppDigits(null)).toBeNull();
    expect(toWhatsAppDigits("123")).toBeNull();
  });
});

describe("defaulterWhatsAppMessage", () => {
  it("includes name, roll, miss count, and recent tasks", () => {
    const text = defaulterWhatsAppMessage({
      studentName: "Aarav Sharma",
      rollNumber: 1,
      missCount: 3,
      days: 7,
      taskTitles: ["HW 1", "NB check", "HW 2", "Extra"],
    });
    expect(text).toMatch(/Aarav Sharma/);
    expect(text).toMatch(/roll 1/);
    expect(text).toMatch(/3 incomplete/);
    expect(text).toMatch(/HW 1, NB check, HW 2/);
    expect(text).not.toMatch(/Extra/);
  });
});

describe("whatsappChatHref", () => {
  it("encodes the message in the URL", () => {
    const href = whatsappChatHref("919876543210", "Hello & hi");
    expect(href).toBe("https://wa.me/919876543210?text=Hello%20%26%20hi");
  });
});
