// Fails if the development fixtures for not-yet-built endpoints reach the
// browser bundle (web/src/lib/api-client/pending-fixtures.ts). Run after
// `next build`. The fixtures file contains the string below.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SENTINEL = "CENSE_FIXTURE_SENTINEL";
const root = join(process.cwd(), ".next", "static");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const hits = walk(root).filter((file) => /\.(js|mjs)$/.test(file) && readFileSync(file, "utf8").includes(SENTINEL));
if (hits.length > 0) {
  console.error(`Development fixtures found in the browser bundle:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("No development fixtures in the browser bundle.");
