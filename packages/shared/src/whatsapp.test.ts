import { describe, expect, it } from "vitest";
import {
  defaulterWhatsAppMessage,
  defaultersClassGroupMessage,
  toWhatsAppDigits,
  whatsappChatHref,
  whatsappShareHref,
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

describe("defaultersClassGroupMessage", () => {
  it("builds a sorted roll list for the class group", () => {
    const text = defaultersClassGroupMessage({
      className: "8-B",
      days: 7,
      defaulters: [
        { rollNumber: 12, name: "Zoya", missCount: 2 },
        { rollNumber: 3, name: "Aarav", missCount: 4 },
      ],
    });
    expect(text).toMatch(/Defaulters — 8-B/);
    expect(text).toMatch(/#3 Aarav — 4 misses/);
    expect(text).toMatch(/#12 Zoya — 2 misses/);
    expect(text.indexOf("#3")).toBeLessThan(text.indexOf("#12"));
    expect(text).toMatch(/please help complete/i);
  });

  it("handles an empty list", () => {
    expect(defaultersClassGroupMessage({ days: 14, defaulters: [] })).toMatch(
      /No students/,
    );
  });
});

describe("whatsappShareHref", () => {
  it("opens the share sheet without a phone", () => {
    expect(whatsappShareHref("Hello")).toBe("https://wa.me/?text=Hello");
  });
});
