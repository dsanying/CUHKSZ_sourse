export type ResourceFile = {
  id: string
  course: string
  name: string
  path: string
  parentPath: string
  category: string
  categoryLabel: string
  extension: string
  size: number
  updatedAt: string
  lanzouUrl?: string
  downloadUrl?: string
  isSplit?: boolean
  parts?: Array<{
    name: string
    path: string
    size: number
    lanzouUrl: string
    fileId?: string
  }>
  previewKind: "pdf" | "office" | null
  previewUrl: string | null
}

export type Course = {
  name: string
  fileCount: number
  totalSize: number
  latestUpdate: string
  folderUrl: string
  folderPassword?: string
  files: ResourceFile[]
}

export type Manifest = {
  generatedAt: string
  repository: string
  branch: string
  source: string
  storageRootUrl: string
  stats: {
    courseCount: number
    fileCount: number
    totalSize: number
    extensions: string[]
    categories: Array<{
      key: string
      label: string
      count: number
    }>
  }
  courses: Course[]
}
