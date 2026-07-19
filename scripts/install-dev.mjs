#!/usr/bin/env bun
/* global Bun, console, process */

import { lstat, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const luaSource = join(root, "hammerspoon", "streamdeck");
const pluginDirectory = join(
  root,
  "plugin",
  "com.brettinternet.hammerspoon.sdPlugin",
);
const manifestPath = join(pluginDirectory, "manifest.json");
const home = process.env.HOME;

function printUsage() {
  console.log(`Usage: bun scripts/install-dev.mjs

Installs the development plugin and links its Hammerspoon Lua module.

Prerequisites:
  bun install
  mise install
  The official Stream Deck application installed and running.

Options:
  --help  Show this help.
`);
}

async function run(command) {
  console.log(`$ ${command.join(" ")}`);
  const child = Bun.spawn(command, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
}

async function existingPath(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function requirePath(path, description) {
  if (!(await existingPath(path))) {
    throw new Error(
      `${description} not found at ${path}; run 'bun install' and rerun install:dev`,
    );
  }
}

async function inspectLuaTarget() {
  if (!home) throw new Error("HOME is not set");

  const target = join(home, ".hammerspoon", "streamdeck");
  const sourceRealPath = await realpath(luaSource).catch(() => {
    throw new Error(`Hammerspoon Lua module source not found at ${luaSource}`);
  });
  const current = await existingPath(target);

  if (!current) return { target, needsLink: true };
  if (!current.isSymbolicLink()) {
    throw new Error(
      `Refusing to replace existing ${target}; move it aside with 'trash' and rerun install:dev`,
    );
  }

  let targetRealPath;
  try {
    targetRealPath = await realpath(target);
  } catch {
    throw new Error(
      `Refusing to replace dangling or unreadable symlink ${target}`,
    );
  }
  if (targetRealPath !== sourceRealPath) {
    throw new Error(
      `Refusing to replace symlink ${target}; it points to ${targetRealPath}`,
    );
  }
  return { target, needsLink: false };
}

async function preflight() {
  if (!home) throw new Error("HOME is not set");

  await requirePath(luaSource, "Hammerspoon Lua module source");
  await requirePath(pluginDirectory, "compiled plugin directory");
  await requirePath(
    join(root, "node_modules", "@elgato", "cli", "package.json"),
    "CLI dependency",
  );
  await requirePath(
    join(root, "plugin", "node_modules", "rollup", "package.json"),
    "build dependency",
  );

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (typeof manifest.UUID !== "string" || manifest.UUID.length === 0) {
    throw new Error("plugin manifest UUID is required");
  }

  return { manifest, luaTarget: await inspectLuaTarget() };
}

async function installLuaModule(luaTarget) {
  await mkdir(dirname(luaTarget.target), { recursive: true });
  if (luaTarget.needsLink) {
    await symlink(luaSource, luaTarget.target, "dir");
    console.log(`Linked ${relative(root, luaSource)} -> ${luaTarget.target}`);
  } else {
    console.log(`Lua module already linked at ${luaTarget.target}`);
  }

  await run([
    "mise",
    "exec",
    "lua",
    "--",
    "lua",
    "-e",
    'assert(loadfile(os.getenv("HOME") .. "/.hammerspoon/streamdeck/init.lua"))',
  ]);
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("This setup helper requires macOS");
  }

  const args = new Set(process.argv.slice(2));
  if (args.has("--help")) {
    printUsage();
    return;
  }
  for (const arg of args) {
    throw new Error(`Unknown option: ${arg}`);
  }

  const setup = await preflight();
  await run(["bun", "run", "build"]);
  await run([
    "bunx",
    "--no-install",
    "streamdeck",
    "validate",
    pluginDirectory,
  ]);
  await installLuaModule(setup.luaTarget);
  await run(["bunx", "--no-install", "streamdeck", "link", pluginDirectory]);
  await run([
    "bunx",
    "--no-install",
    "streamdeck",
    "restart",
    setup.manifest.UUID,
  ]);

  console.log(`
Setup complete.

Manual Hammerspoon step:
  Add require("streamdeck"), your streamdeck.register(...) calls, and
  streamdeck.start() to $HOME/.hammerspoon/init.lua, then reload Hammerspoon.

Manual Stream Deck step:
  Add the Hammerspoon Action and select a registered action ID in its inspector.
`);
}

await main().catch((error) => {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
});
