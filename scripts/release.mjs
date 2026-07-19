#!/usr/bin/env bun
/* global Bun, Buffer, Response, console */

import { createHash } from "node:crypto";
import { chmod, cp, mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const pluginDirectory = join(root, "plugin/com.brettinternet.hammerspoon.sdPlugin");
const manifestPath = join(pluginDirectory, "manifest.json");
const luaDirectory = join(root, "hammerspoon/streamdeck");
const installerSource = join(root, "scripts/install-release.sh");
const generatedFiles = [
  join(pluginDirectory, "bin/plugin.js"),
  join(pluginDirectory, "bin/plugin.js.map"),
  join(pluginDirectory, "ui/property-inspector.js"),
  join(pluginDirectory, "ui/property-inspector.js.map"),
];
const releaseRoot = join(root, "dist/releases");
const fixedTime = new Date("1980-01-01T00:00:00Z");

async function run(command, cwd = root, stdin) {
  const process = Bun.spawn(command, {
    cwd,
    stdin: stdin === undefined ? "inherit" : "pipe",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (stdin !== undefined) {
    process.stdin.write(stdin);
    process.stdin.end();
  }
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
}

async function capture(command, cwd = root) {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "inherit" });
  const output = Buffer.from(await new Response(process.stdout).arrayBuffer());
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
  return output;
}

async function filesIn(directory) {
  const files = [];
  async function visit(current) {
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(relative(directory, path).split(sep).join("/"));
      }
    }
  }
  await visit(directory);
  return files.sort();
}

async function pathsIn(directory) {
  const paths = [directory];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      paths.push(path);
      if (entry.isDirectory()) {
        await visit(path);
      }
    }
  }
  await visit(directory);
  return paths.sort((left, right) => right.length - left.length);
}

async function normalizeTimes(directory) {
  for (const path of await pathsIn(directory)) {
    await utimes(path, fixedTime, fixedTime);
  }
}

async function snapshotFiles(paths) {
  const snapshots = [];
  for (const path of paths) {
    try {
      const info = await stat(path);
      snapshots.push({
        path,
        bytes: await readFile(path),
        mode: info.mode,
        atime: info.atime,
        mtime: info.mtime,
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      snapshots.push({ path });
    }
  }
  return snapshots;
}

async function restoreFiles(snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.bytes === undefined) {
      await rm(snapshot.path, { force: true });
      continue;
    }
    await writeFile(snapshot.path, snapshot.bytes, { mode: snapshot.mode });
    await chmod(snapshot.path, snapshot.mode);
    await utimes(snapshot.path, snapshot.atime, snapshot.mtime);
  }
}

async function findPackage(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const result = await findPackage(path);
      if (result) return result;
    } else if (entry.isFile() && extname(entry.name) === ".streamDeckPlugin") {
      return path;
    }
  }
  return undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const version = manifest.Version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`manifest Version must be a four-part version, got ${JSON.stringify(version)}`);
}
if (typeof manifest.UUID !== "string" || manifest.UUID.length === 0) {
  throw new Error("manifest UUID is required for release naming");
}

const outputDirectory = join(releaseRoot, version);
const generatedSnapshots = await snapshotFiles(generatedFiles);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "stream-deck-hammerspoon-release-"));
try {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const packedDirectory = join(temporaryDirectory, "packed");
  const unpackedPluginDirectory = join(temporaryDirectory, "plugin");
  const luaStageDirectory = join(temporaryDirectory, "lua");
  await mkdir(packedDirectory, { recursive: true });
  await mkdir(unpackedPluginDirectory, { recursive: true });
  await mkdir(luaStageDirectory, { recursive: true });

  await run(["bun", "run", "build"]);
  await run(["bunx", "--no-install", "streamdeck", "validate", pluginDirectory]);
  await run([
    "bunx",
    "--no-install",
    "streamdeck",
    "pack",
    "--force",
    "--no-update-check",
    "--output",
    packedDirectory,
    "--version",
    version,
    pluginDirectory,
  ]);

  const rawPluginPackage = await findPackage(packedDirectory);
  if (!rawPluginPackage) {
    throw new Error(`streamdeck pack did not create a .streamDeckPlugin file in ${packedDirectory}`);
  }
  await run(["unzip", "-q", rawPluginPackage, "-d", unpackedPluginDirectory]);
  await normalizeTimes(unpackedPluginDirectory);
  const pluginFiles = await filesIn(unpackedPluginDirectory);
  const pluginArtifact = join(outputDirectory, `${manifest.UUID}-${version}.streamDeckPlugin`);
  await run(["zip", "-X", "-q", pluginArtifact, "-@"], unpackedPluginDirectory, `${pluginFiles.join("\n")}\n`);

  const luaArtifactDirectory = join(luaStageDirectory, "streamdeck");
  await cp(luaDirectory, luaArtifactDirectory, { recursive: true });
  await writeFile(join(luaArtifactDirectory, "VERSION"), `${version}\n`);
  await normalizeTimes(luaStageDirectory);
  const luaFiles = await filesIn(luaStageDirectory);
  const luaTarPath = join(temporaryDirectory, `stream-deck-hammerspoon-lua-${version}.tar`);
  await run(["tar", "-cf", luaTarPath, "--format", "ustar", "-C", luaStageDirectory, ...luaFiles]);
  const luaArtifact = join(outputDirectory, `stream-deck-hammerspoon-lua-${version}.tar.gz`);
  const installerArtifact = join(outputDirectory, "stream-deck-hammerspoon-install.sh");
  await cp(installerSource, installerArtifact);
  await chmod(installerArtifact, 0o755);
  await writeFile(luaArtifact, await capture(["gzip", "-n", "-c", luaTarPath]));

  const artifacts = [basename(pluginArtifact), basename(luaArtifact), basename(installerArtifact)].sort();
  const sums = [];
  for (const artifact of artifacts) {
    const bytes = await readFile(join(outputDirectory, artifact));
    sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${artifact}`);
  }
  await writeFile(join(outputDirectory, "SHA256SUMS"), `${sums.join("\n")}\n`);
  await writeFile(
    join(outputDirectory, "RELEASE.json"),
    `${JSON.stringify({ version, plugin: artifacts.find((artifact) => artifact.endsWith(".streamDeckPlugin")), lua: artifacts.find((artifact) => artifact.endsWith(".tar.gz")), installer: basename(installerArtifact), checksums: "SHA256SUMS" }, null, 2)}\n`,
  );
  console.log(`Release artifacts written to ${relative(root, outputDirectory)}`);
} finally {
  await restoreFiles(generatedSnapshots);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
