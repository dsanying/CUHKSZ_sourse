import assert from "node:assert/strict"
import test from "node:test"

import {
  applyLanzouUrls,
  buildLanzouLookup,
} from "./lanzou-manifest.mjs"

test("buildLanzouLookup normalizes paths and ignores empty URLs", () => {
  const lookup = buildLanzouLookup({
    files: [
      {
        path: "/ACT2111/学习资料/a.pdf",
        lanzouUrl: "https://example.com/a",
      },
      {
        path: "ACT2121/学习资料/b.pdf",
        url: "https://example.com/b",
      },
      {
        path: "CEC1000/学习资料/c.docx",
        lanzouUrl: "",
      },
    ],
  })

  assert.equal(lookup.get("ACT2111/学习资料/a.pdf")?.lanzouUrl, "https://example.com/a")
  assert.equal(lookup.get("ACT2121/学习资料/b.pdf")?.lanzouUrl, "https://example.com/b")
  assert.equal(lookup.has("CEC1000/学习资料/c.docx"), false)
})

test("applyLanzouUrls only adds matching Lanzou links", () => {
  const files = [
    {
      path: "ACT2111/学习资料/a.pdf",
      size: 1024,
    },
    {
      path: "ACT2121/学习资料/b.pdf",
      size: 2048,
    },
  ]
  const lookup = buildLanzouLookup({
    files: [
      {
        path: "ACT2111/学习资料/a.pdf",
        lanzouUrl: "https://example.com/a",
      },
    ],
  })

  const merged = applyLanzouUrls(files, lookup)

  assert.equal(merged[0].lanzouUrl, "https://example.com/a")
  assert.equal("lanzouUrl" in merged[1], false)
})
