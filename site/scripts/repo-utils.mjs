import { execFileSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"

export const SITE_DIR = path.resolve(import.meta.dirname, "..")
export const REPO_ROOT = path.resolve(SITE_DIR, "..")
export const ARCHIVE_TAG = "course-archives"

const EXCLUDED_TOP_LEVEL = new Set([
  ".git",
  ".github",
  ".superpowers",
  "node_modules",
  "site",
])

const EXCLUDED_FILES = new Set([".DS_Store", "Thumbs.db"])

export function getRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY
  }

  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim()
    const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)

    if (match) {
      return match[1]
    }
  } catch {
    // Fall through to the public repository used by this project.
  }

  return "dsanying/CUHKSZ_sourse"
}

export function getBranch() {
  return process.env.GITHUB_REF_NAME || "main"
}

export function getTopLevelResourceDirs() {
  return readdirSync(REPO_ROOT)
    .filter((entry) => !EXCLUDED_TOP_LEVEL.has(entry))
    .filter((entry) => !entry.startsWith("."))
    .filter((entry) => {
      const absolutePath = path.join(REPO_ROOT, entry)
      return statSync(absolutePath).isDirectory()
    })
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
}

export function shouldSkipFile(fileName) {
  return EXCLUDED_FILES.has(fileName)
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/")
}

export function encodePathForUrl(filePath) {
  return filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

export function getArchiveName(courseName) {
  return `${courseName}.zip`
}

export function getArchiveDownloadUrl(repository, courseName) {
  const assetName = encodeURIComponent(getArchiveName(courseName))
  return `https://github.com/${repository}/releases/download/${ARCHIVE_TAG}/${assetName}`
}
