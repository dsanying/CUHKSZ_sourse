import * as React from "react"
import {
  ArchiveIcon,
  BookOpenIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FilterIcon,
  FolderArchiveIcon,
  LoaderCircleIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Course, Manifest, ResourceFile } from "@/types"

const MANIFEST_URL = `${import.meta.env.BASE_URL}manifest.json`

const EXTENSION_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  doc: "Word",
  ppt: "PPT",
  pptx: "PPT",
  zip: "ZIP",
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / 1024 ** exponent

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value))
}

function getExtensionLabel(extension: string) {
  return EXTENSION_LABELS[extension] ?? extension.toUpperCase()
}

function matchesSearch(file: ResourceFile, search: string) {
  const text = `${file.course} ${file.name} ${file.path} ${file.parentPath}`.toLowerCase()
  return text.includes(search.toLowerCase())
}

function filterCourse(course: Course, search: string, extension: string) {
  const files = course.files.filter((file) => {
    const searchMatched = search.trim() ? matchesSearch(file, search.trim()) : true
    const extensionMatched =
      extension === "all" ? true : file.extension === extension

    return searchMatched && extensionMatched
  })

  return { ...course, files, fileCount: files.length }
}

function useManifest() {
  const [manifest, setManifest] = React.useState<Manifest | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let isMounted = true

    fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json() as Promise<Manifest>
      })
      .then((data) => {
        if (isMounted) {
          setManifest(data)
        }
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "清单加载失败")
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  return { manifest, error }
}

function ThemeToggle() {
  const [isDark, setIsDark] = React.useState(() =>
    document.documentElement.classList.contains("dark")
  )

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="切换明暗主题"
          onClick={() => {
            const nextTheme = isDark ? "light" : "dark"
            localStorage.setItem("theme", nextTheme)
            document.documentElement.classList.toggle("dark", nextTheme === "dark")
            document.documentElement.classList.toggle("light", nextTheme === "light")
            setIsDark(nextTheme === "dark")
          }}
        >
          {isDark ? (
            <SunIcon data-icon="inline-start" />
          ) : (
            <MoonIcon data-icon="inline-start" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>切换明暗主题</TooltipContent>
    </Tooltip>
  )
}

function CourseFilter({
  courses,
  selectedCourse,
  onSelectCourse,
}: {
  courses: Course[]
  selectedCourse: string
  onSelectCourse: (course: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={selectedCourse === "all" ? "default" : "ghost"}
        className="justify-start"
        onClick={() => onSelectCourse("all")}
      >
        <BookOpenIcon data-icon="inline-start" />
        全部课程
      </Button>
      {courses.map((course) => (
        <Button
          key={course.name}
          type="button"
          variant={selectedCourse === course.name ? "default" : "ghost"}
          className="justify-between"
          onClick={() => onSelectCourse(course.name)}
        >
          <span className="truncate">{course.name}</span>
          <Badge variant="secondary">{course.fileCount}</Badge>
        </Button>
      ))}
    </div>
  )
}

function FileRow({ file }: { file: ResourceFile }) {
  return (
    <div className="grid gap-3 border-t py-3 text-sm first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{file.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{getExtensionLabel(file.extension)}</Badge>
            <span>{formatBytes(file.size)}</span>
            {file.parentPath ? <span>{file.parentPath}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2 sm:justify-end">
        <Button asChild size="sm">
          <a href={file.rawUrl} download>
            <DownloadIcon data-icon="inline-start" />
            下载
          </a>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="outline" size="icon-sm">
              <a href={file.githubUrl} target="_blank" rel="noreferrer" aria-label="在 GitHub 查看">
                <ExternalLinkIcon data-icon="inline-start" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>在 GitHub 查看</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function CourseCard({ course }: { course: Course }) {
  const shownFiles = course.files.slice(0, 12)
  const hiddenCount = course.files.length - shownFiles.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{course.name}</CardTitle>
        <CardDescription>
          {course.fileCount} 个文件 · {formatBytes(course.totalSize)} · 更新于{" "}
          {formatDate(course.latestUpdate)}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <a href={course.archiveUrl}>
              <FolderArchiveIcon data-icon="inline-start" />
              下载课程压缩包
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {shownFiles.map((file) => (
          <FileRow key={file.id} file={file} />
        ))}
        {hiddenCount > 0 ? (
          <div className="border-t pt-3 text-sm text-muted-foreground">
            还有 {hiddenCount} 个文件。使用搜索或课程筛选可以继续缩小范围。
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        正在加载资料清单...
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>清单加载失败</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>重新加载</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function App() {
  const { manifest, error } = useManifest()
  const [search, setSearch] = React.useState("")
  const [selectedCourse, setSelectedCourse] = React.useState("all")
  const [selectedExtension, setSelectedExtension] = React.useState("all")

  const visibleCourses = React.useMemo(() => {
    if (!manifest) {
      return []
    }

    return manifest.courses
      .filter((course) =>
        selectedCourse === "all" ? true : course.name === selectedCourse
      )
      .map((course) => filterCourse(course, search, selectedExtension))
      .filter((course) => course.files.length > 0)
  }, [manifest, search, selectedCourse, selectedExtension])

  const visibleFileCount = visibleCourses.reduce(
    (sum, course) => sum + course.files.length,
    0
  )

  if (error) {
    return <ErrorState message={error} />
  }

  if (!manifest) {
    return <LoadingState />
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <ArchiveIcon className="size-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                    港中深课程资料下载
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    直接搜索课程、文件名或资料路径，支持单文件下载和课程目录压缩包。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <a
                  href={`https://github.com/${manifest.repository}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  GitHub 仓库
                </a>
              </Button>
              <ThemeToggle />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardDescription>课程目录</CardDescription>
                <CardTitle>{manifest.stats.courseCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>资料文件</CardDescription>
                <CardTitle>{manifest.stats.fileCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>资料总量</CardDescription>
                <CardTitle>{formatBytes(manifest.stats.totalSize)}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6 flex flex-col gap-4">
            <div>
              <div className="mb-3 text-sm font-medium">课程筛选</div>
              <ScrollArea className="h-[calc(100svh-9rem)] pr-3">
                <CourseFilter
                  courses={manifest.courses}
                  selectedCourse={selectedCourse}
                  onSelectCourse={setSelectedCourse}
                />
              </ScrollArea>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex gap-2">
              <InputGroup className="h-10">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索课程、文件名或路径"
                  aria-label="搜索课程、文件名或路径"
                />
                {search ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label="清空搜索"
                      onClick={() => setSearch("")}
                    >
                      <XIcon data-icon="inline-start" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="lg:hidden">
                    <FilterIcon data-icon="inline-start" />
                    筛选
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <SheetHeader>
                    <SheetTitle>课程筛选</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="mt-4 h-[calc(100svh-7rem)] pr-3">
                    <CourseFilter
                      courses={manifest.courses}
                      selectedCourse={selectedCourse}
                      onSelectCourse={setSelectedCourse}
                    />
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={selectedExtension} onValueChange={setSelectedExtension}>
                <TabsList className="flex-wrap">
                  <TabsTrigger value="all">全部类型</TabsTrigger>
                  {manifest.stats.extensions.map((extension) => (
                    <TabsTrigger key={extension} value={extension}>
                      {getExtensionLabel(extension)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="text-sm text-muted-foreground">
                当前显示 {visibleCourses.length} 个课程分组，{visibleFileCount} 个文件
              </div>
            </div>
          </div>

          <Separator className="mb-5" />

          {visibleCourses.length > 0 ? (
            <div className="flex flex-col gap-4">
              {visibleCourses.map((course) => (
                <CourseCard key={course.name} course={course} />
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>没有匹配的资料</CardTitle>
                <CardDescription>
                  换个关键词，或清空文件类型和课程筛选后再试。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("")
                    setSelectedCourse("all")
                    setSelectedExtension("all")
                  }}
                >
                  清空筛选
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
