import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

type Manifest = {
  Icon: string;
  CategoryIcon: string;
  Actions: Array<{
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
