import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  REPO_ROOT,
  shouldSkipFile,
  SITE_DIR,
  toPosixPath,
} from "./repo-utils.mjs"
import { LANZOU_MANIFEST_PATH } from "./lanzou-manifest.mjs"

const ORIGIN = "https://up.woozooo.com"
const ROOT_FOLDER_NAME =
  process.env.LANZOU_CLASSIC_ROOT_FOLDER_NAME || "CUHKSZ_sourse"
const ROOT_PARENT_ID = process.env.LANZOU_CLASSIC_ROOT_PARENT_ID || "0"
const UPLOAD_LIMIT = Number(process.env.LANZOU_UPLOAD_LIMIT || 0)
const ALLOW_PARTIAL = process.env.LANZOU_ALLOW_PARTIAL === "true"
const SPLIT_SIZE = Number(process.env.LANZOU_CLASSIC_SPLIT_SIZE || 95 * 1024 * 1024)
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024
const VEI_FALLBACK = "UVVeXAVXVghTBA9fXlI="
const CLASSIC_ALLOWED_EXTENSIONS = new Set(
  "apk,zip,rar,txt,7z,z,e,ct,doc,docx,exe,ke,db,tar,pdf,epub,mobi,azw,azw3,w3x,osk,osz,jar,xpk,cpk,lua,dmg,ppt,pptx,xls,xlsx,mp3,gz,psd,ipa,iso,ttf,txf,ttc,dwg,bat,dll,deb,rp,rpm,rplib,mobileconfig,appimage,img,imazingapp,lolgezi,bin,xapk,flac,conf,crx,gho,patch,cad,hwt,accdb,ce,xmind,enc,bds,bdi,ssf,it,pkg,cfg,mp4,avi,png,gif,jpeg,jpg,webp,brushset,1"
    .split(",")
    .filter(Boolean)
)

const RESOURCE_EXCLUDES = new Set([
  ".git",
  ".github",
  "docs",
  "node_modules",
  "site",
])

function getFirefoxCookieHeader() {
  const profileRoot = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Firefox",
    "Profiles"
  )

  if (!existsSync(profileRoot)) {
    return ""
  }

  for (const profile of readdirSync(profileRoot)) {
    const cookieDb = path.join(profileRoot, profile, "cookies.sqlite")

    if (!existsSync(cookieDb)) {
      continue
    }

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "lanzou-cookie-"))
    const tempDb = path.join(tempDir, "cookies.sqlite")

    try {
      copyFileSync(cookieDb, tempDb)
      const rows = execFileSync(
        "sqlite3",
        [
          tempDb,
          "select host,name,value from moz_cookies where host like '%woozooo%' order by host,name;",
        ],
        { encoding: "utf8" }
      )
        .trim()
        .split("\n")
        .filter(Boolean)

      const cookies = rows.flatMap((row) => {
        const [host, name, ...rest] = row.split("|")
        return [".woozooo.com", "up.woozooo.com"].includes(host)
          ? [`${name}=${rest.join("|")}`]
          : []
      })

      if (cookies.length > 0) {
        return Array.from(new Set(cookies)).join("; ")
      }
    } catch {
      // Try the next profile.
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  return ""
}

const COOKIE =
  process.env.LANZOU_CLASSIC_COOKIE ||
  process.env.LANZOU_COOKIE ||
  getFirefoxCookieHeader()

if (!COOKIE) {
  console.error("未找到普通蓝奏云登录 Cookie。请先在 Firefox 登录 up.woozooo.com。")
  process.exit(1)
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Cookie: COOKIE,
      Referer: `${ORIGIN}/mydisk.php`,
      "User-Agent": "Mozilla/5.0",
      ...(options.headers || {}),
    },
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${url} HTTP ${response.status}: ${text.slice(0, 180)}`)
  }

  return text
}

async function postDoupload(params, uid) {
  const endpoint = uid
    ? `${ORIGIN}/doupload.php?uid=${encodeURIComponent(uid)}`
    : `${ORIGIN}/doupload.php`
  const text = await fetchText(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams(params),
  })

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`蓝奏云返回非 JSON：${text.slice(0, 180)}`)
  }
}

async function getSessionInfo() {
  const html = await fetchText(`${ORIGIN}/mydisk.php`)
  const uid =
    html.match(/doupload\.php\?uid=(\d+)/)?.[1] ||
    html.match(/[?&]u=(\d+)/)?.[1] ||
    process.env.LANZOU_CLASSIC_UID
  const vei =
    html.match(/'vei'\s*:\s*'([^']+)'/)?.[1] ||
    html.match(/"vei"\s*:\s*"([^"]+)"/)?.[1] ||
    process.env.LANZOU_CLASSIC_VEI ||
    VEI_FALLBACK
  const maxFileSize = Number(html.match(/var upsizeb\s*=\s*'(\d+)'/)?.[1]) ||
    Number(process.env.LANZOU_CLASSIC_MAX_FILE_SIZE || DEFAULT_MAX_FILE_SIZE)

  if (!uid) {
    throw new Error("无法从普通蓝奏云页面识别用户 ID。")
  }

  return { uid, vei, maxFileSize }
}

async function listFolders(folderId, session) {
  const result = await postDoupload(
    { task: "47", folder_id: folderId, vei: session.vei },
    session.uid
  )
  return result?.zt === 1 || result?.zt === 2 ? result.text || [] : []
}

async function listFiles(folderId, session) {
  const files = []

  for (let page = 1; page < 200; page += 1) {
    const result = await postDoupload(
      { task: "5", folder_id: folderId, pg: String(page), vei: session.vei },
      session.uid
    )

    if (result?.zt !== 1) {
      break
    }

    files.push(...(result.text || []))

    if (String(result.info) === "0") {
      break
    }
  }

  return files
}

async function ensureFolder(parentId, folderName, session) {
  const blueParentId = parentId === "0" ? "-1" : parentId
  const existing = (await listFolders(blueParentId, session)).find(
    (folder) => folder.name === folderName || folder.folder_name === folderName
  )

  if (existing?.fol_id || existing?.folder_id) {
    return String(existing.fol_id || existing.folder_id)
  }

  const result = await postDoupload(
    {
      task: "2",
      parent_id: parentId,
      folder_name: folderName,
      folder_description: "",
    },
    session.uid
  )

  if (result?.zt !== 1 || !result.text) {
    throw new Error(`蓝奏云文件夹创建失败：${folderName}：${result?.info || "未知错误"}`)
  }

  return String(result.text)
}

async function ensureFolderPath(rootFolderId, segments, session) {
  let currentId = rootFolderId

  for (const segment of segments) {
    currentId = await ensureFolder(currentId, segment, session)
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
    const segments = relativePath.split("/")
    const [topLevel] = segments

    if (!topLevel || RESOURCE_EXCLUDES.has(topLevel) || topLevel.startsWith(".")) {
      continue
    }

    if (segments.length === 1 && stats.isFile()) {
      continue
    }

    if (stats.isDirectory()) {
      collectResourceFiles(absolutePath, files)
      continue
    }

    if (stats.isFile()) {
      files.push({
        absolutePath,
        path: relativePath,
        name: entry,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      })
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"))
}

function md5File(filePath) {
  return crypto.createHash("md5").update(readFileSync(filePath)).digest("hex")
}

function getExtension(fileName) {
  return path.extname(fileName).replace(".", "").toLowerCase()
}

function wrapFileIfNeeded(file) {
  const extension = getExtension(file.name)

  if (CLASSIC_ALLOWED_EXTENSIONS.has(extension)) {
    return file
  }

  const wrapDir = mkdtempSync(path.join(os.tmpdir(), "lanzou-wrap-"))
  const wrappedName = `${file.name}.zip`
  const wrappedPath = path.join(wrapDir, wrappedName)

  execFileSync("zip", ["-j", "-q", wrappedPath, file.absolutePath])

  return {
    ...file,
    absolutePath: wrappedPath,
    path: `${file.path}.zip`,
    name: wrappedName,
    uploadWrapped: true,
    originalPath: file.path,
    originalName: file.name,
    originalSize: file.size,
    originalUpdatedAt: file.updatedAt,
    wrapDir,
    size: statSync(wrappedPath).size,
  }
}

function splitFile(file, maxFileSize) {
  if (file.size <= maxFileSize) {
    return [file]
  }

  const partDir = mkdtempSync(path.join(os.tmpdir(), "lanzou-parts-"))
  const source = readFileSync(file.absolutePath)
  const partCount = Math.ceil(source.length / SPLIT_SIZE)
  const width = Math.max(3, String(partCount).length)
  const parts = []

  for (let index = 0; index < partCount; index += 1) {
    const partNumber = String(index + 1).padStart(width, "0")
    const partName = `${file.name}.part${partNumber}-of-${String(partCount).padStart(
      width,
      "0"
    )}.zip`
    const partPath = path.join(partDir, partName)
    writeFileSync(partPath, source.subarray(index * SPLIT_SIZE, (index + 1) * SPLIT_SIZE))
    parts.push({
      absolutePath: partPath,
      path: `${file.path}.parts/${partName}`,
      name: partName,
      size: statSync(partPath).size,
      updatedAt: file.updatedAt,
      originalPath: file.path,
      originalName: file.name,
      partDir,
    })
  }

  return parts
}

async function uploadFile(file, folderId, session) {
  const formData = new FormData()
  const buffer = readFileSync(file.absolutePath)

  formData.set("task", "1")
  formData.set("vie", "2")
  formData.set("ve", "2")
  formData.set("id", `WU_FILE_${Date.now()}`)
  formData.set("name", file.name)
  formData.set("type", "application/octet-stream")
  formData.set("lastModifiedDate", new Date(file.updatedAt).toString())
  formData.set("size", String(file.size))
  formData.set("folder_id_bb_n", folderId)
  formData.set("upload_file", new Blob([buffer]), file.name)

  const text = await fetchText(`${ORIGIN}/html5up.php`, {
    method: "POST",
    body: formData,
  })
  const result = JSON.parse(text)

  if (result?.zt !== 1) {
    throw new Error(`上传失败：${file.path}：${result?.info || text.slice(0, 180)}`)
  }

  return result.text?.[0]
}

async function getFileShare(fileId) {
  const result = await postDoupload({ task: "22", file_id: fileId })

  if (result?.zt !== 1) {
    return null
  }

  return result.info
}

async function getFolderShare(folderId) {
  const result = await postDoupload({ task: "18", folder_id: folderId })

  if (result?.zt !== 1) {
    return null
  }

  return result.info
}

function buildFileUrl(share) {
  if (!share?.is_newd || !share?.f_id) {
    return ""
  }

  return `${share.is_newd}/${share.f_id}`
}

async function syncUploadFile(rootFolderId, file, session) {
  const segments = file.path.split("/")
  const fileName = segments.pop()
  const folderId = await ensureFolderPath(rootFolderId, segments, session)
  const existing = (await listFiles(folderId, session)).find(
    (item) => item.name === fileName || item.name_all === fileName
  )
  const record = existing || (await uploadFile(file, folderId, session))
  const fileId = String(record.id)
  const share = await getFileShare(fileId)
  const lanzouUrl = buildFileUrl(share) || `${record.is_newd}/${record.f_id}`

  if (!lanzouUrl) {
    throw new Error(`无法获取蓝奏云文件链接：${file.path}`)
  }

  return {
    path: file.originalPath || file.path,
    name: file.originalName || file.name,
    size: file.originalSize || file.size,
    md5: md5File(file.absolutePath),
    updatedAt: file.originalUpdatedAt || file.updatedAt,
    uploadedPath: file.path,
    uploadedName: file.name,
    uploadWrapped: Boolean(file.uploadWrapped),
    fileId,
    folderId,
    lanzouUrl,
    lanzouDomain: share?.is_newd || record.is_newd || "",
    lanzouFileKey: share?.f_id || record.f_id || "",
    source: "lanzou-classic",
  }
}

async function syncFile(rootFolderId, file, session) {
  const uploadFileItem = wrapFileIfNeeded(file)
  const parts = splitFile(uploadFileItem, session.maxFileSize)

  try {
    if (parts.length === 1 && !parts[0].partDir) {
      return await syncUploadFile(rootFolderId, uploadFileItem, session)
    }

    const uploadedParts = []

    for (const part of parts) {
      uploadedParts.push(await syncUploadFile(rootFolderId, part, session))
    }

    const partFolderId = uploadedParts[0]?.folderId
    const share = partFolderId ? await getFolderShare(partFolderId) : null

    return {
      path: file.path,
      name: file.name,
      size: file.size,
      md5: md5File(file.absolutePath),
      updatedAt: file.updatedAt,
      folderId: partFolderId,
      lanzouUrl: share?.new_url || uploadedParts[0]?.lanzouUrl || "",
      folderPassword: share?.onof === "1" ? share.pwd : "",
      source: "lanzou-classic",
      isSplit: true,
      splitSize: SPLIT_SIZE,
      parts: uploadedParts.map((part) => ({
        path: part.path,
        name: part.name,
        size: part.size,
        lanzouUrl: part.lanzouUrl,
        fileId: part.fileId,
      })),
    }
  } finally {
    if (uploadFileItem.wrapDir) {
      rmSync(uploadFileItem.wrapDir, { recursive: true, force: true })
    }

    for (const part of parts) {
      if (part.partDir) {
        rmSync(part.partDir, { recursive: true, force: true })
      }
    }
  }
}

async function main() {
  const session = await getSessionInfo()
  const rootFolderId =
    process.env.LANZOU_CLASSIC_ROOT_FOLDER_ID ||
    (await ensureFolder(ROOT_PARENT_ID, ROOT_FOLDER_NAME, session))
  const allFiles = collectResourceFiles()
  const files = UPLOAD_LIMIT > 0 ? allFiles.slice(0, UPLOAD_LIMIT) : allFiles
  const previous = existsSync(LANZOU_MANIFEST_PATH)
    ? JSON.parse(readFileSync(LANZOU_MANIFEST_PATH, "utf8"))
    : { files: [] }
  const merged = new Map((previous.files || []).map((entry) => [entry.path, entry]))
  const failures = []
  const courseFolders = new Map()

  for (const file of files) {
    try {
      const item = await syncFile(rootFolderId, file, session)
      merged.set(item.path, item)
      console.log(`蓝奏云普通版已同步：${file.path}`)
    } catch (error) {
      failures.push({ path: file.path, error: error.message })
      console.warn(`蓝奏云普通版同步失败：${file.path}：${error.message}`)

      if (!ALLOW_PARTIAL) {
        throw error
      }
    }
  }

  for (const courseName of new Set(allFiles.map((file) => file.path.split("/")[0]))) {
    const folderId = await ensureFolderPath(rootFolderId, [courseName], session)
    const share = await getFolderShare(folderId)

    if (share?.new_url) {
      courseFolders.set(courseName, {
        course: courseName,
        folderId,
        lanzouUrl: share.new_url,
        password: share.onof === "1" ? share.pwd : "",
      })
    }
  }

  mkdirSync(path.dirname(LANZOU_MANIFEST_PATH), { recursive: true })
  writeFileSync(
    LANZOU_MANIFEST_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "lanzou-classic",
        rootFolderName: ROOT_FOLDER_NAME,
        rootFolderId,
        maxFileSize: session.maxFileSize,
        splitSize: SPLIT_SIZE,
        files: Array.from(merged.values()).sort((a, b) =>
          a.path.localeCompare(b.path, "zh-Hans-CN")
        ),
        courseFolders: Array.from(courseFolders.values()).sort((a, b) =>
          a.course.localeCompare(b.course, "zh-Hans-CN")
        ),
        failures,
      },
      null,
      2
    )}\n`
  )

  console.log(
    `蓝奏云普通版同步完成：本次处理 ${files.length} 个，失败 ${failures.length} 个。`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
