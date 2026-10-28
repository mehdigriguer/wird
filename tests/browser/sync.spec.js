import { test, expect } from "@playwright/test";
import { localDate, newState, updateKnown } from "../../src/planner.js";

const key = "wird.progress.v1";
const SUPABASE_HOST = "https://yujmlthogyrtaqqkbekh.supabase.co";

const remoteState = updateKnown(newState(), [78, 79]);
const remoteRow = {
  state: remoteState,
  updated_at: "2026-10-27T20:00:00.000Z",
};

function fakeSession() {
  return {
    access_token: "fake-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "fake-refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001", email: "test@wird.app", aud: "authenticated", role: "authenticated" },
  };
}

test("the sync conflict modal renders and resolves both ways", async ({
  page,
}) => {
  const local = updateKnown(newState(localDate()), [112, 113]);
  const pushed = [];
  await page.route(`${SUPABASE_HOST}/rest/v1/user_state*`, async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: remoteRow });
    pushed.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: {} });
  });
  await page.goto("/");
  await page.evaluate(
    ({ key, state, session, storageKey }) => {
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      key,
      state: local,
      session: fakeSession(),
      storageKey: "sb-yujmlthogyrtaqqkbekh-auth-token",
    },
  );
  await page.reload();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Quelle version garder ?" }),
  ).toBeVisible();
  await expect(dialog).toContainText("2 sourates");
  await dialog.getByRole("button", { name: /Cet appareil/ }).click();
  await expect(dialog).toHaveCount(0);
  // la version locale (sourates 112, 113) a été poussée
  await expect
    .poll(() => pushed.length, { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(pushed.at(-1).state.known).toEqual([112, 113]);
});
