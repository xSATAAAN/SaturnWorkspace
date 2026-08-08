import { execFileSync } from "node:child_process"
import { readdirSync, rmSync } from "node:fs"

const output = ".test-dist"
try {
  rmSync(output, { recursive: true, force: true })
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.test.json"], { stdio: "inherit" })
  const tests = readdirSync(output)
    .filter((name) => name.endsWith(".test.js") && name !== "public-handler.test.js")
    .map((name) => `${output}/${name}`)
  execFileSync(process.execPath, ["--import", "./scripts/node-test-setup.mjs", "--test", ...tests], { stdio: "inherit" })
} finally {
  rmSync(output, { recursive: true, force: true })
}
