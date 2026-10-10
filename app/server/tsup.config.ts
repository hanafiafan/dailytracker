import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/scripts/migrate-legacy.ts", "src/scripts/reset-launch.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  // Native / large deps stay external (installed in the image); our shared code is bundled in.
  external: ["better-sqlite3"],
});
