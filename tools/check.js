// Syntax checks without introducing a build step or dependencies.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
for (const root of ["src", "tests", "tools"]) {
  for (const entry of readdirSync(root, {recursive: true})) {
    if (entry.endsWith(".js")) execFileSync(process.execPath, ["--check", join(root, entry)], {stdio: "inherit"});
  }
}
console.log("JavaScript syntax checks passed.");
