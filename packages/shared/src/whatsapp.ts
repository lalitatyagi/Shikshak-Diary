import { normalizeIndianPhone } from "./auth.js";

/**
 * Digits for https://wa.me/<digits> (country code, no +).
 * Returns null when the contact is missing or not a valid Indian mobile.
 */
export function toWhatsAppDigits(
  raw: string | null | undefined,
): string | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const e164 = normalizeIndianPhone(raw);
  if (!e164) {
    return null;
  }
  return e164.replace(/^\+/, "");
}

export function whatsappChatHref(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Share sheet without a phone (teacher picks the chat). */
export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function defaulterWhatsAppMessage(input: {
  studentName: string;
  rollNumber: number;
  missCount: number;
  days: number;
  taskTitles: string[];
}): string {
  const tasks = input.taskTitles.slice(0, 3).join(", ");
  const taskBit = tasks ? ` (${tasks})` : "";
  return (
    `Namaste, this is regarding ${input.studentName} (roll ${input.rollNumber}). ` +
    `They have ${input.missCount} incomplete homework/notebook checks in the last ${input.days} days${taskBit}. ` +
    `Please help them complete the pending work. Thank you.`
  );
}

export type DefaulterGroupLine = {
  rollNumber: number;
  name: string;
  missCount: number;
};

/**
 * One message for the class WhatsApp group: short roll list + ask parents
 * to follow up. Teacher opens wa.me/?text= and picks the group.
 */
export function defaultersClassGroupMessage(input: {
  className?: string;
  days: number;
  defaulters: DefaulterGroupLine[];
}): string {
  const heading = input.className
    ? `Defaulters — ${input.className} (last ${input.days} days)`
    : `Defaulters (last ${input.days} days)`;

  if (input.defaulters.length === 0) {
    return `${heading}\n\nNo students with 2+ incomplete checks.`;
  }

  const lines = [...input.defaulters]
    .sort((a, b) => a.rollNumber - b.rollNumber)
    .map(
      (row) =>
        `#${row.rollNumber} ${row.name} — ${row.missCount} miss${
          row.missCount === 1 ? "" : "es"
        }`,
    );

  return (
    `${heading}\n\n` +
    `${lines.join("\n")}\n\n` +
    `Parents, please help complete pending homework / notebook work. Thank you.`
  );
}
