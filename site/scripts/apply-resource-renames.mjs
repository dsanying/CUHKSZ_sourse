import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { REPO_ROOT } from "./repo-utils.mjs"

const planPath = path.join(REPO_ROOT, ".local-audit", "resource-rename-plan.json")
const plans = JSON.parse(readFileSync(planPath, "utf8"))

for (const plan of plans) {
  if (!plan.changed) {
    continue
  }

  mkdirSync(path.dirname(path.join(REPO_ROOT, plan.targetPath)), {
    recursive: true,
  })
  execFileSync("git", ["mv", plan.sourcePath, plan.targetPath], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  })
}

console.log(`已执行 ${plans.filter((plan) => plan.changed).length} 个 git mv。`)
