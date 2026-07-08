import path from "node:path"

export const CATEGORY_DEFINITIONS = [
  { key: "learning", label: "学习资料", directory: "学习资料" },
  { key: "exam", label: "考试资料", directory: "考试资料" },
  { key: "homework", label: "作业习题", directory: "作业习题" },
  { key: "other", label: "其他资料", directory: "其他资料" },
]

const CATEGORY_BY_KEY = new Map(
  CATEGORY_DEFINITIONS.map((category) => [category.key, category])
)

const NOISE_PATTERNS = [
  /\bZ-Library\b/gi,
  /\bmodified\b/gi,
  /\bStudent Value Edition\b/gi,
  /\bGlobal Edition\b/gi,
  /\bTextbook\b/gi,
  /\bRecommended Textbook\b/gi,
  /00001/g,
]

function withoutExtension(relativePath) {
  return relativePath.slice(0, -path.extname(relativePath).length)
}

function getBaseName(relativePath) {
  return path.basename(withoutExtension(relativePath))
}

function stripCoursePrefix(courseName, title) {
  return title
    .replace(new RegExp(`^${escapeRegExp(courseName)}[\\s_-]+`, "i"), "")
    .replace(new RegExp(`^${escapeRegExp(courseName)}`, "i"), "")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeSeparators(value) {
  return value
    .replace(/[’']/g, "")
    .replace(/[：:]/g, "_")
    .replace(/[，,]/g, "_")
    .replace(/[;；]/g, "_")
    .replace(/[()[\]{}【】]/g, "_")
    .replace(/[.]+/g, "_")
    .replace(/[\\/]+/g, "_")
    .replace(/[–—-]+/g, "_")
    .replace(/\s*&\s*/g, "&")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeEdition(value) {
  return value
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, number, suffix) => `${number}${suffix.toLowerCase()}`)
    .replace(/\b[Ee]dition\b/g, "Edition")
    .replace(/第([一二三四五六七八九十\d]+)版/g, "第$1版")
}

const CHINESE_NUMBERS = new Map([
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
  ["十", 10],
])

function parseChineseNumber(value) {
  if (/^\d+$/.test(value)) {
    return Number(value)
  }

  if (value === "十") {
    return 10
  }

  if (value.startsWith("十")) {
    return 10 + (CHINESE_NUMBERS.get(value.slice(1)) ?? 0)
  }

  if (value.endsWith("十")) {
    return (CHINESE_NUMBERS.get(value.slice(0, -1)) ?? 0) * 10
  }

  if (value.includes("十")) {
    const [tens, ones] = value.split("十")
    return (
      (CHINESE_NUMBERS.get(tens) ?? 0) * 10 +
      (CHINESE_NUMBERS.get(ones) ?? 0)
    )
  }

  return CHINESE_NUMBERS.get(value)
}

function getSortablePrefix(title) {
  const leadingNumber = title.match(/^(\d{1,3})(?=第?[一二三四五六七八九十\d]*章|章|[_\s-]*第)/)
  if (leadingNumber) {
    return leadingNumber[1].padStart(2, "0")
  }

  const chapter = title.match(/第([一二三四五六七八九十\d]{1,3})章/)
  if (!chapter) {
    return null
  }

  const number = parseChineseNumber(chapter[1])
  return number ? String(number).padStart(2, "0") : null
}

export function normalizeTitle(rawTitle) {
  let title = rawTitle
    .replace(/^c[-_]+/i, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")

  for (const pattern of NOISE_PATTERNS) {
    title = title.replace(pattern, "")
  }

  title = title
    .replace(/(中文版)(.+)中文版/gi, "$1$2")
    .replace(/^\d{1,3}(?=第[一二三四五六七八九十\d]+章)/, "")
    .replace(/\(中文版\)中文版/gi, "(中文版)")
    .replace(/中文版中文版/gi, "中文版")
    .replace(/_?\(\s*\)_?/g, "_")
    .replace(/\s+\./g, ".")

  return normalizeSeparators(normalizeEdition(title))
}

function inferExamName(courseName, relativePath) {
  const extension = path.extname(relativePath)
  const raw = getBaseName(relativePath)
  const pathSegments = relativePath.split("/")
  const examCourse =
    pathSegments.find((segment) =>
      /^([A-Z]{2,4}\d{4}|MAT1001|MAT1002)$/.test(segment)
    ) ?? raw.match(/^(MAT1001|MAT1002)(?=[_-])/)?.[1]
  const fileCourseName = examCourse ?? courseName
  const stripped = stripCoursePrefix(courseName, raw)
  const source = stripped
    .replace(new RegExp(escapeRegExp(fileCourseName), "gi"), "")
    .replace(/WithSolution/gi, "_WithSolution")

  const yearMatch = source.match(/(20\d{2}|19\d{2})/)
  const term = /summer/i.test(source) ? "_Summer" : ""
  const sample = /sample/i.test(source) ? "_Sample" : ""
  const examType = /midterm|mid/i.test(source)
    ? "Midterm"
    : /final/i.test(source)
      ? "Final"
      : /期中/i.test(source)
        ? "期中复习资料"
        : normalizeTitle(source.replace(yearMatch?.[1] ?? "", "")) || "Exam"
  const solution = /withsolution|solution|答案|解答/i.test(source)
    ? "_WithSolution"
    : ""

  if (!yearMatch) {
    return `${fileCourseName}_${sample ? "Sample_" : ""}${examType}${solution}${extension}`
  }

  return `${fileCourseName}_${yearMatch[1]}${term}${sample}_${examType}${solution}${extension}`
}

function inferGeneralName(courseName, relativePath) {
  const extension = path.extname(relativePath)
  const rawTitle = stripCoursePrefix(courseName, getBaseName(relativePath))
  const sortablePrefix = getSortablePrefix(rawTitle)
  const title = normalizeTitle(rawTitle)
  const normalizedTitle = title || normalizeTitle(getBaseName(relativePath))
  const sortableTitle =
    sortablePrefix && !normalizedTitle.startsWith(`${sortablePrefix}_`)
      ? `${sortablePrefix}_${normalizedTitle}`
      : normalizedTitle
  const prefix = sortableTitle.startsWith(`${courseName}_`) ? "" : `${courseName}_`

  return `${prefix}${sortableTitle}${extension}`
}

export function classifyResource(courseName, relativePath) {
  const lowerPath = relativePath.toLowerCase()

  if (/(^|\/)考试资料(\/|$)/.test(relativePath)) {
    return CATEGORY_BY_KEY.get("exam")
  }

  if (/(^|\/)作业习题(\/|$)/.test(relativePath)) {
    return CATEGORY_BY_KEY.get("homework")
  }

  if (/(^|\/)学习资料(\/|$)/.test(relativePath)) {
    return CATEGORY_BY_KEY.get("learning")
  }

  if (/(^|\/)其他资料(\/|$)/.test(relativePath)) {
    return CATEGORY_BY_KEY.get("other")
  }

  if (
    /(^|\/)exam(\/|$)/i.test(relativePath) ||
    /exam|midterm|final|quiz|sample|withsolution|solution|期中|期末|真题|样题/i.test(relativePath)
  ) {
    return CATEGORY_BY_KEY.get("exam")
  }

  if (/homework|assignment|problem|exercise|习题|题库|课后题|答案/i.test(relativePath)) {
    return CATEGORY_BY_KEY.get("homework")
  }

  if (
    /lecture|slide|ppt|课件|讲义|笔记|知识点|outline|导读|复习资料|培训/i.test(relativePath) ||
    /textbook|book|edition|principles|introduction|calculus|algebra|economics|management|psychology|chemistry|algorithm|accounting|finance|financial|python|learning|theory|statistics|business|operations|supply|marketing|consumer|behavior|precalculus|methods|cognitive|translation|dialogue|nature|humanities|prml|econometrics|optimization|probability|lifespan|life-span/i.test(lowerPath) ||
    /教材|课本|高等数学|宏观经济学|微观经济学|算法导论|线代|与自然对话|与人文对话|财务管理|概率论|统计|翻译|心理学|深度学习|会计|金融|经济学原理|管理|市场营销|消费者行为|人文|自然|道德与法治|模式识别|机器学习|计量经济学|凸优化|组织行为|发展/i.test(relativePath)
  ) {
    return CATEGORY_BY_KEY.get("learning")
  }

  if (!["PED", "其它资料"].includes(courseName)) {
    return CATEGORY_BY_KEY.get("learning")
  }

  return CATEGORY_BY_KEY.get("other")
}

export function planResourcePath(courseName, relativePath) {
  const category = classifyResource(courseName, relativePath)
  const fileName =
    category.key === "exam"
      ? inferExamName(courseName, relativePath)
      : inferGeneralName(courseName, relativePath)

  return `${courseName}/${category.directory}/${fileName}`
}
