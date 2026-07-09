import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  CATEGORY_DEFINITIONS,
  classifyResource,
  planResourcePath,
} from "./resource-classifier.mjs"
import {
  getTopLevelResourceDirs,
  REPO_ROOT,
  shouldSkipFile,
  SITE_DIR,
  toPosixPath,
} from "./repo-utils.mjs"

function collectFiles(courseName, currentDir, files = []) {
  for (const entry of readdirSync(currentDir)) {
    if (shouldSkipFile(entry)) {
      continue
    }

    const absolutePath = path.join(currentDir, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      collectFiles(courseName, absolutePath, files)
      continue
    }

    if (stats.isFile()) {
      files.push(toPosixPath(path.relative(REPO_ROOT, absolutePath)))
    }
  }

  return files
}

function makeUniquePath(targetPath, usedPaths) {
  if (!usedPaths.has(targetPath)) {
    usedPaths.add(targetPath)
    return targetPath
  }

  const extension = path.extname(targetPath)
  const base = targetPath.slice(0, -extension.length)
  let index = 2
  let candidate = `${base}_v${index}${extension}`

  while (usedPaths.has(candidate)) {
    index += 1
    candidate = `${base}_v${index}${extension}`
  }

  usedPaths.add(candidate)
  return candidate
}

function getConfidence(sourcePath, plannedPath) {
  if (sourcePath.includes("/Exam/")) {
    return "高"
  }

  if (/Z-Library|00001|unknown|unkown|_$|\(\s*\)|\[SI Unit/i.test(sourcePath)) {
    return "中"
  }

  if (plannedPath.includes("/其他资料/")) {
    return "中"
  }

  return "高"
}

const usedTargets = new Set()
const plans = []

for (const courseName of getTopLevelResourceDirs()) {
  for (const sourcePath of collectFiles(courseName, path.join(REPO_ROOT, courseName))) {
    const category = classifyResource(courseName, sourcePath)
    const plannedPath = makeUniquePath(planResourcePath(courseName, sourcePath), usedTargets)

    plans.push({
      course: courseName,
      category: category.key,
      categoryLabel: category.label,
      sourcePath,
      targetPath: plannedPath,
      confidence: getConfidence(sourcePath, plannedPath),
      changed: sourcePath !== plannedPath,
    })
  }
}

const categoryCounts = Object.fromEntries(
  CATEGORY_DEFINITIONS.map((category) => [
    category.label,
    plans.filter((plan) => plan.category === category.key).length,
  ])
)

const reportLines = [
  "# 资料命名整理审计报告",
  "",
  "## 命名规则",
  "",
  "- 目录表达资料类型：`学习资料`、`考试资料`、`作业习题`、`其他资料`。",
  "- 文件名保留课程代码，方便搜索结果脱离目录时仍能看出课程。",
  "- 文件名不重复资料类型。",
  "- 英文书名不强制翻译；清理来源噪音、重复词和明显截断符号。",
  "- 考试资料使用 `COURSE_YYYY[_Summer][_Sample]_ExamType[_WithSolution].ext`。",
  "",
  "## 分类统计",
  "",
  ...Object.entries(categoryCounts).map(([label, count]) => `- ${label}: ${count}`),
  "",
  "## 重命名清单",
  "",
  "| 置信度 | 分类 | 当前路径 | 建议路径 |",
  "| --- | --- | --- | --- |",
  ...plans.map(
    (plan) =>
      `| ${plan.confidence} | ${plan.categoryLabel} | \`${plan.sourcePath}\` | \`${plan.targetPath}\` |`
  ),
  "",
]

const auditDir = path.join(REPO_ROOT, ".local-audit")
mkdirSync(auditDir, { recursive: true })
writeFileSync(
  path.join(auditDir, "resource-rename-plan.json"),
  `${JSON.stringify(plans, null, 2)}\n`
)
writeFileSync(
  path.join(auditDir, "resource-audit.md"),
  `${reportLines.join("\n")}\n`
)

console.log(`已生成 ${plans.length} 条重命名计划。`)
console.log(`需要移动/改名：${plans.filter((plan) => plan.changed).length} 个文件。`)
console.log(JSON.stringify(categoryCounts, null, 2))
