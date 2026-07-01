import { expect, test } from "@playwright/test";

test("mock mode meeting can start, receive transcript, finish, and export markdown", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const micButton = page.getByTestId("mic-check-button");
  await expect(micButton).toBeEnabled();
  await micButton.click();
  const startButton = page.locator('[data-testid="start-session-button"]:visible');
  await expect(startButton).toBeEnabled();

  await startButton.click();
  await expect(page).toHaveURL(/\/session\/local-/);
  await expect(page.getByTestId("live-screen")).toBeVisible();

  await expect(
    page.locator('[data-testid="transcript-row"][data-state="final"]').first(),
  ).toBeVisible({
    timeout: 12_000,
  });

  await page.getByTestId("stop-session-button").click();
  await page.getByTestId("confirm-stop-button").click();

  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByTestId("result-screen")).toBeVisible();
  await expect(page.getByTestId("export-md-button")).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-md-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});
