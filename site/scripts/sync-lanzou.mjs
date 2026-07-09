import crypto from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import {
  REPO_ROOT,
  shouldSkipFile,
  SITE_DIR,
  toPosixPath,
} from "./repo-utils.mjs"
import { LANZOU_MANIFEST_PATH } from "./lanzou-manifest.mjs"

const API_BASE = "https://apis.ilanzou.com"
const QINIU_UPLOAD_URL = "https://upload.qiniup.com"
const ROOT_FOLDER_NAME = process.env.LANZOU_ROOT_FOLDER_NAME || "CUHKSZ_sourse"
const ROOT_PARENT_ID = process.env.LANZOU_ROOT_PARENT_ID || "0"
const UPLOAD_LIMIT = Number(process.env.LANZOU_UPLOAD_LIMIT || 0)
const APP_TOKEN = process.env.LANZOU_APP_TOKEN || getCookieValue("appToken")
const UUID = process.env.LANZOU_UUID || process.env.LANZOU_DEV_CODE
const COOKIE = process.env.LANZOU_COOKIE || ""
const ACCOUNT = process.env.LANZOU_ACCOUNT || ""
const ALLOW_PARTIAL = process.env.LANZOU_ALLOW_PARTIAL !== "false"

const RESOURCE_EXCLUDES = new Set([".git", ".github", "docs", "node_modules", "site"])

function getCookieValue(name) {
  const match = (process.env.LANZOU_COOKIE || "").match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  )
  return match ? decodeURIComponent(match[1]) : ""
}

function encryptLanzou(value) {
  const cipher = crypto.createCipheriv(
    "aes-128-ecb",
    Buffer.from("lanZouY-disk-app", "utf8"),
    null
  )
  cipher.setAutoPadding(true)
  return Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]).toString(
    "hex"
  )
}

function signedParams(params = {}) {
  return {
    ...params,
    uuid: UUID,
    devType: "6",
    devCode: UUID,
    devModel: "github-actions",
    devVersion: process.version.replace(/^v/, ""),
    appVersion: "",
    timestamp: encryptLanzou(Date.now()),
    appToken: APP_TOKEN,
    extra: "2",
  }
}

async function apiRequest(method, endpoint, params = {}) {
  const url = new URL(endpoint, API_BASE)
  const signed = signedParams(method === "GET" ? params : {})
  Object.entries(signed).forEach(([key, value]) => url.searchParams.set(key, value))

  const options = {
    method,
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.ilanzou.com",
      Referer: "https://www.ilanzou.com/console/files/0",
      ...(COOKIE ? { Cookie: COOKIE } : {}),
    },
  }

  if (method !== "GET") {
    options.headers["Content-Type"] = "application/json;charset=UTF-8"
    options.body = JSON.stringify(params)
  }

  const response = await fetch(url, options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${endpoint} HTTP ${response.status}: ${text.slice(0, 180)}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${endpoint} returned non-JSON response: ${text.slice(0, 180)}`)
  }
}

async function getFileList(folderId) {
  const result = await apiRequest("GET", "/proved/record/file/list", {
    offset: 1,
    limit: 500,
    folderId,
  })
  return result?.list || result?.data?.list || []
}

async function findChild(folderId, name, fileType) {
  const list = await getFileList(folderId)
  return list.find((entry) => {
    const entryType = Number(entry.fileType)
    const entryName = entry.fileName || entry.folderName
    return entryType === fileType && entryName === name
  })
}

async function ensureFolder(parentId, folderName) {
  const existing = await findChild(parentId, folderName, 2)

  if (existing?.folderId) {
    return existing.folderId
  }

  await apiRequest("POST", "/proved/file/folder/save", {
    folderId: parentId,
    folderName,
    folderDesc: "",
  })

  const created = await findChild(parentId, folderName, 2)

  if (!created?.folderId) {
    throw new Error(`蓝奏云文件夹创建后未找到：${folderName}`)
  }

  return created.folderId
}

async function ensureFolderPath(rootFolderId, segments) {
  let currentId = rootFolderId

  for (const segment of segments) {
    currentId = await ensureFolder(currentId, segment)
  }

  return currentId
}

function collectResourceFiles(currentDir = REPO_ROOT, files = []) {
  for (const entry of readdirSync(currentDir)) {
    if (shouldSkipFile(entry)) {
      continue
    }

    const absolutePath = path.join(currentDir, entry)
    const stats = statSync(absolutePath)
    const relativePath = toPosixPath(path.relative(REPO_ROOT, absolutePath))
    const [topLevel] = relativePath.split("/")

    if (!topLevel || RESOURCE_EXCLUDES.has(topLevel) || topLevel.startsWith(".")) {
      continue
    }

    if (stats.isDirectory()) {
      collectResourceFiles(absolutePath, files)
    } else if (stats.isFile()) {
      files.push({
        absolutePath,
        path: relativePath,
        name: entry,
        size: stats.size,
      })
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"))
}

function md5File(filePath) {
  return crypto.createHash("md5").update(readFileSync(filePath)).digest("hex")
}

function buildUploadKey(timestamp) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const accountSegment = ACCOUNT || "github-actions"
  return `disk/${year}/${month}/${day}/${accountSegment}/${timestamp}.rar`
}

async function uploadToQiniu(file, upToken, key) {
  const formData = new FormData()
  const blob = new Blob([readFileSync(file.absolutePath)])

  formData.set("token", upToken)
  formData.set("key", key)
  formData.set("file", blob, file.name)

  const response = await fetch(QINIU_UPLOAD_URL, {
    method: "POST",
    body: formData,
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`七牛上传失败 HTTP ${response.status}: ${text.slice(0, 180)}`)
  }

  return JSON.parse(text)
}

async function waitForUploadedFile(folderId, fileName, retries = 12) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const existing = await findChild(folderId, fileName, 1)

    if (existing?.fileId) {
      return existing
    }

    await new Promise((resolve) => setTimeout(resolve, 2500))
  }

  throw new Error(`上传完成后未在蓝奏云列表找到文件：${fileName}`)
}

async function createShareUrl(fileId) {
  const result = await apiRequest("POST", "/proved/share/url", {
    shareId: "",
    fileIds: fileId,
    folderIds: "",
    code: "",
    amt: "",
    term: 0,
    showRecommend: 0,
    showUpTime: 1,
    showDownloads: 1,
    showComments: 1,
    showStars: 1,
    showLikes: 1,
  })

  return result?.shareUrl || result?.data?.shareUrl || ""
}

async function syncFile(rootFolderId, file) {
  const segments = file.path.split("/")
  const fileName = segments.pop()
  const folderId = await ensureFolderPath(rootFolderId, segments)
  const existing = await findChild(folderId, fileName, 1)

  if (!existing?.fileId) {
    const timestamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    const tokenResult = await apiRequest("POST", "/proved/7n/getUpToken", {
      fileName,
      type: 1,
      md5: md5File(file.absolutePath),
      fileSize: Math.max(1, Math.round(file.size / 1024)),
      folderId,
      fileId: "",
    })

    if (tokenResult?.upToken !== -1 && tokenResult?.data?.upToken !== -1) {
      const upToken = tokenResult?.upToken || tokenResult?.data?.upToken

      if (!upToken) {
        throw new Error(`蓝奏云未返回上传 token：${file.path}`)
      }

      await uploadToQiniu(file, upToken, buildUploadKey(timestamp))
    }
  }

  const record = existing?.fileId ? existing : await waitForUploadedFile(folderId, fileName)
  const shareUrl = await createShareUrl(record.fileId).catch(() => "")
  const lanzouUrl = record.fileUrl || ""

  if (!lanzouUrl) {
    throw new Error(`文件没有可写入 manifest 的蓝奏云链接：${file.path}`)
  }

  return {
    path: file.path,
    fileId: record.fileId,
    folderId,
    lanzouUrl,
    shareUrl,
    fileUrl: record.fileUrl || "",
    updatedAt: new Date().toISOString(),
  }
}

async function main() {
  if (!APP_TOKEN || !UUID) {
    console.log("未配置 LANZOU_APP_TOKEN / LANZOU_UUID，跳过蓝奏云同步。")
    return
  }

  const files = collectResourceFiles()
  const limitedFiles = UPLOAD_LIMIT > 0 ? files.slice(0, UPLOAD_LIMIT) : files
  const rootFolderId =
    process.env.LANZOU_ROOT_FOLDER_ID ||
    (await ensureFolder(ROOT_PARENT_ID, ROOT_FOLDER_NAME))
  const synced = []
  const failures = []

  for (const file of limitedFiles) {
    try {
      const item = await syncFile(rootFolderId, file)
      synced.push(item)
      console.log(`蓝奏云已同步：${file.path}`)
    } catch (error) {
      failures.push({ path: file.path, error: error.message })
      console.warn(`蓝奏云同步失败：${file.path}：${error.message}`)

      if (!ALLOW_PARTIAL) {
        throw error
      }
    }
  }

  mkdirSync(path.dirname(LANZOU_MANIFEST_PATH), { recursive: true })

  const previous = existsSync(LANZOU_MANIFEST_PATH)
    ? JSON.parse(readFileSync(LANZOU_MANIFEST_PATH, "utf8"))
    : { files: [] }
  const merged = new Map((previous.files || []).map((entry) => [entry.path, entry]))

  for (const item of synced) {
    merged.set(item.path, item)
  }

  writeFileSync(
    LANZOU_MANIFEST_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rootFolderName: ROOT_FOLDER_NAME,
        rootFolderId,
        files: Array.from(merged.values()).sort((a, b) =>
          a.path.localeCompare(b.path, "zh-Hans-CN")
        ),
        failures,
      },
      null,
      2
    )}\n`
  )

  console.log(
    `蓝奏云同步完成：成功 ${synced.length} 个，失败 ${failures.length} 个。`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
