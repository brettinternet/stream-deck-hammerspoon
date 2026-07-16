import { describe, expect, test } from "bun:test";
import { parseInitialActionInfo } from "../src/property-inspector-state";

describe("parseInitialActionInfo", () => {
  test("reads the action id from nested payload settings", () => {
    const actionInfo = JSON.stringify({
      action: "com.brettinternet.hammerspoon.action",
      context: "context-01",
      payload: {
        settings: { actionId: "com.brettinternet.hammerspoon.action" },
        coordinates: { column: 0, row: 0, page: 0 },
      },
    });

    expect(parseInitialActionInfo(actionInfo)).toBe("com.brettinternet.hammerspoon.action");
  });

  test("returns no selection for missing or malformed payload", () => {
    expect(parseInitialActionInfo(JSON.stringify({ context: "context-01" }))).toBe("");
    expect(parseInitialActionInfo(JSON.stringify({ payload: "not-an-object" }))).toBe("");
    expect(parseInitialActionInfo("not-json")).toBe("");
  });

  test("returns no selection for an empty action id", () => {
    expect(
      parseInitialActionInfo(JSON.stringify({ payload: { settings: { actionId: "" } } })),
    ).toBe("");
  });

  test("ignores a misleading top-level settings object", () => {
    expect(
      parseInitialActionInfo(
        JSON.stringify({
          settings: { actionId: "incorrect-top-level-action" },
          payload: { settings: {} },
        }),
      ),
    ).toBe("");
  });
});
