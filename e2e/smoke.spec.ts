import { expect, test } from "@playwright/test";

/**
 * Portfolio smoke: demo teacher signs in, opens 8-B tick grid, taps one cell.
 */
test("teacher logs in and marks a homework cell", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Classroom Tracker" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill("teacher@demo.local");
  await page.getByLabel("Password").fill("Teacher123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Your classes" })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.getByText("8-B")).toBeVisible();

  await page.getByRole("link", { name: "Tick grid" }).first().click();

  await expect(page.getByRole("heading", { name: "8-B" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Student")).toBeVisible();

  // Roll 1 — seed names repeat every 20 students, so scope by roll row.
  const firstCell = page
    .getByRole("row", { name: /^1\s+Aarav Sharma/ })
    .getByRole("button", { name: "Aarav Sharma Exercise 1.1" });
  await expect(firstCell).toBeVisible();

  const before = (await firstCell.textContent())?.trim() ?? "";
  await firstCell.click();

  await expect
    .poll(async () => (await firstCell.textContent())?.trim() ?? "", {
      timeout: 10_000,
    })
    .not.toBe(before);
});
