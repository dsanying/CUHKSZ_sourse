#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import re
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path

from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parents[2]
SKIPPED_TOP_LEVEL = {".git", ".github", "docs", "site"}
VISUAL_REVIEW_NOTES = {
    "CSC1002/学习资料/CSC1002_Learning_Python_5th_Edition.pdf": "已渲染首页确认：Learning Python, 5th Edition。",
    "ECO2021/学习资料/ECO2021_宏观经济学_第5版_罗伯特_巴罗_中文版.pdf": "已渲染首页确认：宏观经济学（第五版），Robert Barro。",
    "ECO3121/考试资料/ECO3121_2021_Midterm_WithSolution.pdf": "已渲染首页确认：ECONOMICS 3121 Introductory Econometrics Midterm Exam，含答案。",
    "FIN2010/学习资料/FIN2010_财务管理基础_第13版_中文版.pdf": "已渲染首页确认：财务管理基础，第13版，中文版。",
    "MAT1001&1002/作业习题/MAT1001&1002_高等数学_习题全解指南_第7版_上册.pdf": "已渲染同系列下册并按原文件名确认：高等数学习题全解指南，第7版，上册。",
    "MAT1001&1002/作业习题/MAT1001&1002_高等数学_习题全解指南_第7版_下册.pdf": "已渲染首页确认：高等数学习题全解指南，第7版，下册。",
    "MAT3007/考试资料/MAT3007_CheatingPaper.pdf": "已渲染首页确认：4 页高密度公式/知识点汇总，按 cheating paper 命名。",
}

logging.getLogger().setLevel(logging.CRITICAL)
logging.getLogger("pypdf").setLevel(logging.ERROR)


def normalize_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def collect_pdfs() -> list[Path]:
    pdfs: list[Path] = []
    for path in REPO_ROOT.rglob("*.pdf"):
        relative = path.relative_to(REPO_ROOT)
        if relative.parts[0] in SKIPPED_TOP_LEVEL:
            continue
        pdfs.append(path)
    return sorted(pdfs)


def extract_record(path: Path) -> dict[str, object]:
    relative_path = path.relative_to(REPO_ROOT).as_posix()
    record: dict[str, object] = {
        "path": relative_path,
        "pages": None,
        "metadataTitle": "",
        "firstPageEvidence": [],
        "needsManualReview": False,
        "note": "",
    }

    try:
        with redirect_stderr(StringIO()):
            reader = PdfReader(str(path))
            record["pages"] = len(reader.pages)
            metadata = reader.metadata or {}
            record["metadataTitle"] = normalize_line(str(metadata.get("/Title", "") or ""))

            text_parts: list[str] = []
            for index in range(min(2, len(reader.pages))):
                text_parts.append(reader.pages[index].extract_text() or "")

        lines: list[str] = []
        for raw_line in "\n".join(text_parts).splitlines():
            line = normalize_line(raw_line)
            if len(line) < 3 or re.fullmatch(r"\d+", line):
                continue
            lines.append(line)
        record["firstPageEvidence"] = lines[:6]

        metadata_title = str(record["metadataTitle"])
        has_useful_metadata = bool(metadata_title) and metadata_title.lower() not in {
            "ssreader print.",
        }

        if not lines and not has_useful_metadata:
            record["needsManualReview"] = True
            record["note"] = "首页未抽取到可用文本，通常是扫描页或图片页。"
        elif not lines and has_useful_metadata:
            record["note"] = "首页未抽取到文本，已使用 PDF 元数据标题核对。"
    except Exception as error:  # pragma: no cover - defensive audit output
        record["needsManualReview"] = True
        record["note"] = f"读取失败：{error!r}"

    if relative_path in VISUAL_REVIEW_NOTES:
        record["needsManualReview"] = False
        record["note"] = VISUAL_REVIEW_NOTES[relative_path]

    return record


def main() -> None:
    records = [extract_record(path) for path in collect_pdfs()]

    audit_dir = REPO_ROOT / ".local-audit"
    audit_dir.mkdir(exist_ok=True)
    (audit_dir / "pdf-title-audit.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    lines = [
        "# PDF 标题核对报告",
        "",
        "## 说明",
        "",
        "- 核对范围：仓库课程资料目录中的所有 PDF，不含 `site/`、`.github/`、`docs/`。",
        "- 标题依据：优先使用首页/前两页抽取文本；抽不到文本时记录 PDF 元数据标题或标记人工复核。",
        "- 对已确认的标题残缺、版次缺失、来源噪音和 CP 命名已在文件名中矫正。",
        "",
        "## 汇总",
        "",
        f"- PDF 总数：{len(records)}",
        f"- 需人工复核：{sum(1 for record in records if record['needsManualReview'])}",
        "",
        "## 明细",
        "",
        "| 文件 | 页数 | 元数据标题 | 首页标题线索 | 备注 |",
        "| --- | ---: | --- | --- | --- |",
    ]

    for record in records:
        evidence = " / ".join(record["firstPageEvidence"][:3]) or "未抽取到文本"
        lines.append(
            "| "
            f"`{record['path']}` | "
            f"{record['pages'] or ''} | "
            f"{record['metadataTitle'] or ''} | "
            f"{evidence} | "
            f"{record['note']} |"
        )

    (audit_dir / "pdf-title-audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"已核对 {len(records)} 个 PDF。")
    print(f"需人工复核：{sum(1 for record in records if record['needsManualReview'])} 个。")


if __name__ == "__main__":
    main()
