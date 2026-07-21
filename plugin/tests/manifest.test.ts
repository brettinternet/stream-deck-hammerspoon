import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

type Manifest = {
  Icon: string;
  CategoryIcon: string;
  Actions: Array<{
    Name: string;
    UUID: string;
    Controllers: string[];
    PropertyInspectorPath: string;
    Icon: string;
    States: Array<{ Image: string }>;
  }>;
};

const pluginDirectory = join(import.meta.dir, "../com.brettinternet.hammerspoon.sdPlugin");
const manifest = JSON.parse(readFileSync(join(pluginDirectory, "manifest.json"), "utf8")) as Manifest;

function expectImagePair(imagePath: string, extension: "png" | "svg"): void {
  expect(existsSync(join(pluginDirectory, `${imagePath}.${extension}`))).toBe(true);
  expect(existsSync(join(pluginDirectory, `${imagePath}@2x.${extension}`))).toBe(true);
}

describe("plugin icon assets", () => {
  test("ships every manifest icon in standard and high-resolution sizes", () => {
    expectImagePair(manifest.Icon, "png");
    expectImagePair(manifest.CategoryIcon, "svg");

    for (const action of manifest.Actions) {
      expectImagePair(action.Icon, "svg");
      for (const state of action.States) {
        expectImagePair(state.Image, "svg");
      }
    }
  });
});

describe("plugin action manifest", () => {
  test("preserves generic identities and registers keypad multi-state", () => {
    expect(manifest.Actions.map((action) => action.UUID)).toEqual([
      "com.brettinternet.hammerspoon.button",
      "com.brettinternet.hammerspoon.action",
      "com.brettinternet.hammerspoon.multistate",
    ]);
    expect(manifest.Actions[0]?.PropertyInspectorPath).toBe("ui/property-inspector.html");
    expect(manifest.Actions[1]?.PropertyInspectorPath).toBe("ui/property-inspector.html");

    const multiState = manifest.Actions[2];
    expect(multiState?.Name).toBe("Hammerspoon Multi-State");
    expect(multiState?.Controllers).toEqual(["Keypad"]);
    expect(multiState?.PropertyInspectorPath).toBe("ui/property-inspector.html");
    expect(multiState?.States.map((state) => state.Image)).toEqual([
      "imgs/multistate-0",
      "imgs/multistate-1",
      "imgs/multistate-2",
      "imgs/multistate-3",
    ]);
  });
});
