import { builtinModules } from "node:module";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

const typescriptOptions = {
  tsconfig: "./tsconfig.json",
  sourceMap: true,
  inlineSources: true,
};

const nodePlugins = [
  nodeResolve({ preferBuiltins: true }),
  commonjs(),
  typescript(typescriptOptions),
];

const propertyInspectorPlugins = [
  nodeResolve(),
  commonjs(),
  typescript(typescriptOptions),
];

/** @type {import("rollup").RollupOptions[]} */
export default [
  {
    input: "src/index.ts",
    output: {
      file: "com.brettinternet.hammerspoon.sdPlugin/bin/plugin.js",
      format: "es",
      sourcemap: true,
    },
    external: (moduleId) => nodeBuiltins.has(moduleId),
    plugins: nodePlugins,
  },
  {
    input: "src/property-inspector.ts",
    output: {
      file: "com.brettinternet.hammerspoon.sdPlugin/ui/property-inspector.js",
      format: "iife",
      name: "HammerspoonPropertyInspector",
      sourcemap: true,
    },
    plugins: propertyInspectorPlugins,
  },
];
