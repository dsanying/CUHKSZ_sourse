import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  CATEGORY_DEFINITIONS,
  classifyResource,
} from "./resource-classifier.mjs"
import {
  getArchiveDownloadUrl,
  getBranch,
  getRepository,
  getTopLevelResourceDirs,
  REPO_ROOT,
  shouldSkipFile,
  SITE_DIR,
  toPosixPath,
  encodePathForUrl,
} from "./repo-utils.mjs"

const repository = getRepository()
const branch = getBranch()
const generatedAt = new Date().toISOString()

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

    if (!stats.isFile()) {
      continue
    }

    const relativePath = toPosixPath(path.relative(REPO_ROOT, absolutePath))
    const segments = relativePath.split("/")
    const extension = path.extname(entry).replace(".", "").toLowerCase() || "file"
    const parentPath = segments.slice(1, -1).join("/")
    const category = classifyResource(courseName, relativePath)

    files.push({
      id: relativePath,
      course: courseName,
      name: entry,
      path: relativePath,
      parentPath,
      category: category.key,
      categoryLabel: category.label,
      extension,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      rawUrl: `https://raw.githubusercontent.com/${repository}/${branch}/${encodePathForUrl(relativePath)}`,
      githubUrl: `https://github.com/${repository}/blob/${branch}/${encodePathForUrl(relativePath)}`,
    })
  }

  return files
}

const courses = getTopLevelResourceDirs().map((courseName) => {
  const files = collectFiles(courseName, path.join(REPO_ROOT, courseName)).sort(
    (a, b) => a.path.localeCompare(b.path, "zh-Hans-CN")
  )
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const latestUpdate = files.reduce(
    (latest, file) =>
      file.updatedAt > latest ? file.updatedAt : latest,
    "1970-01-01T00:00:00.000Z"
  )

  return {
    name: courseName,
    fileCount: files.length,
    totalSize,
    latestUpdate,
    archiveName: `${courseName}.zip`,
    archiveUrl: getArchiveDownloadUrl(repository, courseName),
    files,
  }
})

const fileCount = courses.reduce((sum, course) => sum + course.fileCount, 0)
const totalSize = courses.reduce((sum, course) => sum + course.totalSize, 0)
const extensions = Array.from(
  new Set(courses.flatMap((course) => course.files.map((file) => file.extension)))
).sort()
const categories = CATEGORY_DEFINITIONS.map((category) => ({
  key: category.key,
  label: category.label,
  count: courses.reduce(
    (sum, course) =>
      sum + course.files.filter((file) => file.category === category.key).length,
    0
  ),
}))

const manifest = {
  generatedAt,
  repository,
  branch,
  releaseTag: "course-archives",
  stats: {
    courseCount: courses.length,
    fileCount,
    totalSize,
    extensions,
    categories,
  },
  courses,
}

const publicDir = path.join(SITE_DIR, "public")
mkdirSync(publicDir, { recursive: true })
writeFileSync(
  path.join(publicDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
)

console.log(
  `已生成 manifest：${courses.length} 个课程目录，${fileCount} 个文件。`
)
