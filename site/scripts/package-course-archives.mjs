import { createWriteStream, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import {
  getArchiveName,
  getTopLevelResourceDirs,
  REPO_ROOT,
  SITE_DIR,
} from "./repo-utils.mjs"

const require = createRequire(import.meta.url)
const { ZipArchive } = require("archiver")
const outputDir = path.join(SITE_DIR, ".archives")
const selectedCourses = process.env.COURSE_ARCHIVE_FILTER
  ? new Set(
      process.env.COURSE_ARCHIVE_FILTER.split("\n")
        .map((course) => course.trim())
        .filter(Boolean)
    )
  : null

function createArchive(courseName) {
  return new Promise((resolve, reject) => {
    const archivePath = path.join(outputDir, getArchiveName(courseName))
    const output = createWriteStream(archivePath)
    const archive = new ZipArchive({ zlib: { level: 0 } })

    output.on("close", () => {
      console.log(`已打包 ${courseName}：${archive.pointer()} bytes`)
      resolve()
    })
    output.on("error", reject)
    archive.on("error", reject)

    archive.pipe(output)
    archive.directory(path.join(REPO_ROOT, courseName), courseName)
    archive.finalize()
  })
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const courseNames = getTopLevelResourceDirs().filter((courseName) =>
  selectedCourses ? selectedCourses.has(courseName) : true
)

if (courseNames.length === 0) {
  console.log("没有需要打包的课程目录。")
  process.exit(0)
}

for (const courseName of courseNames) {
  await createArchive(courseName)
}

console.log(`课程压缩包已输出到：${outputDir}`)
