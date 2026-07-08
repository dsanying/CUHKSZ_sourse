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
  rawUrl: string
  githubUrl: string
  previewKind: "pdf" | "office" | null
  previewUrl: string | null
}

export type Course = {
  name: string
  fileCount: number
  totalSize: number
  latestUpdate: string
  archiveName: string
  archiveUrl: string
  files: ResourceFile[]
}

export type Manifest = {
  generatedAt: string
  repository: string
  branch: string
  releaseTag: string
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
