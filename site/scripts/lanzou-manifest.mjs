import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { SITE_DIR, toPosixPath } from "./repo-utils.mjs"

export const LANZOU_MANIFEST_PATH = path.join(
  SITE_DIR,
  "public",
  "lanzou-manifest.json"
)

function normalizeResourcePath(resourcePath) {
  return toPosixPath(String(resourcePath || ""))
    .replace(/^\/+/, "")
    .trim()
}

export function buildLanzouLookup(manifest) {
  const lookup = new Map()

  for (const entry of manifest?.files || []) {
    const resourcePath = normalizeResourcePath(entry.path)
    const lanzouUrl = String(entry.lanzouUrl || entry.url || "").trim()

    if (!resourcePath || !lanzouUrl) {
      continue
    }

    lookup.set(resourcePath, {
      ...entry,
      path: resourcePath,
      lanzouUrl,
      downloadUrl: String(entry.downloadUrl || "").trim(),
    })
  }

  return lookup
}

export function readLanzouManifest(manifestPath = LANZOU_MANIFEST_PATH) {
  if (!existsSync(manifestPath)) {
    return null
  }

  return JSON.parse(readFileSync(manifestPath, "utf8"))
}

export function readLanzouLookup(manifestPath = LANZOU_MANIFEST_PATH) {
  if (!existsSync(manifestPath)) {
    return new Map()
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  return buildLanzouLookup(manifest)
}

export function applyLanzouUrls(files, lookup) {
  return files.map((file) => {
    const match = lookup.get(normalizeResourcePath(file.path))

    if (!match?.lanzouUrl) {
      return file
    }

    return {
      ...file,
      lanzouUrl: match.lanzouUrl,
      downloadUrl: match.downloadUrl || match.lanzouUrl,
      isSplit: Boolean(match.isSplit),
      parts: match.parts || [],
    }
  })
}
