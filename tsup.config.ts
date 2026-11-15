import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  // `require("eslint-plugin-trust-boundary")` returns the plugin itself, not { default }
  cjsInterop: true,
  splitting: true,
  target: "node22",
  clean: true,
  external: ["eslint"],
});
