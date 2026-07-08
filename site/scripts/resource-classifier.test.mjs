import test from "node:test"
import assert from "node:assert/strict"

import {
  classifyResource,
  planResourcePath,
  normalizeTitle,
} from "./resource-classifier.mjs"

test("classifies exam resources from Exam folder and exam keywords", () => {
  assert.equal(classifyResource("CSC1001", "CSC1001/Exam/CSC1001_2019_MidWithSolution.pdf").key, "exam")
  assert.equal(classifyResource("MAT2041", "MAT2041/MAT2041_2023_SampleFinal.pdf").key, "exam")
  assert.equal(classifyResource("MAT3007", "MAT3007/考试资料/MAT3007_CP.pdf").key, "exam")
})

test("classifies learning resources from textbook and note keywords", () => {
  assert.equal(classifyResource("CEC1000", "CEC1000/01第一章知识点梳理.docx").key, "learning")
  assert.equal(classifyResource("CSC3001", "CSC3001/CSC3001 Introduction_to_algorithms-3rd Edition.pdf").key, "learning")
})

test("classifies homework resources from exercise keywords", () => {
  assert.equal(classifyResource("STA2001", "STA2001/STA2001 概率论与数理统计习题全解指南.pdf").key, "homework")
})

test("normalizes noisy titles without translating book names", () => {
  assert.equal(normalizeTitle("Microeconomics (Pindyck, Ro_ (Z-Library)"), "Microeconomics_Pindyck_Ro")
  assert.equal(normalizeTitle("FIN2010 中文版财务管理基础(第十三版)中文版 00001"), "FIN2010_中文版财务管理基础_第十三版")
})

test("plans path with category directory and course-prefixed filename", () => {
  assert.equal(
    planResourcePath("CSC1001", "CSC1001/Exam/CSC1001_2019_MidWithSolution.pdf"),
    "CSC1001/考试资料/CSC1001_2019_Midterm_WithSolution.pdf"
  )
  assert.equal(
    planResourcePath("CEC1000", "CEC1000/01第一章知识点梳理.docx"),
    "CEC1000/学习资料/CEC1000_01_第一章知识点梳理.docx"
  )
  assert.equal(
    planResourcePath("MAT1001&1002", "MAT1001&1002/Exam/MAT1002/2023_MidtermSolution.pdf"),
    "MAT1001&1002/考试资料/MAT1002_2023_Midterm_WithSolution.pdf"
  )
  assert.equal(
    planResourcePath("FIN2010", "FIN2010/香港中文大学（深圳）金融学会 FIN2010 期中复习资料.pdf"),
    "FIN2010/考试资料/FIN2010_期中复习资料.pdf"
  )
})
