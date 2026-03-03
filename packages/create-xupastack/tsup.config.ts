import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  bundle: true,
  sourcemap: false,
  clean: true,
  // Bundle all workspace packages too so the CLI is self-contained
  noExternal: [/@xupastack\/.*/],
});
