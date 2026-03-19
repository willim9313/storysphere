"""
explore_api.py — 上傳一本 PDF，逐一打所有 API 並把結果存成 JSON 檔。

用法：
    python scripts/explore_api.py path/to/book.pdf

輸出：
    output/<book_id>/  資料夾，每個 API 一個 .json 檔

前提：後端已在 localhost:8000 執行（uvicorn src.api.main:app）
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

BASE = "http://localhost:8000/api/v1"
POLL_INTERVAL = 2   # 秒
POLL_TIMEOUT  = 300 # 秒


# ── 工具函式 ─────────────────────────────────────────────────────────────────

def save(out_dir: Path, name: str, data: object) -> None:
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"  ✓  {path}")


def poll_task(client: httpx.Client, task_id: str) -> dict:
    """輪詢 /tasks/:taskId/status 直到 done 或 error。"""
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        resp = client.get(f"{BASE}/tasks/{task_id}/status")
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        stage  = data.get("stage", "")
        progress = data.get("progress", 0)
        print(f"    [{status}] {progress}%  {stage}", end="\r")
        if status in ("done", "error"):
            print()
            return data
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Task {task_id} 沒有在 {POLL_TIMEOUT}s 內完成")


# ── 主流程 ───────────────────────────────────────────────────────────────────

def main(pdf_path: str) -> None:
    pdf = Path(pdf_path)
    if not pdf.exists():
        sys.exit(f"找不到檔案：{pdf_path}")

    client = httpx.Client(timeout=60)

    # ── Step 1：上傳 PDF ─────────────────────────────────────────────────────
    print(f"\n[1/6] 上傳 {pdf.name} ...")
    with pdf.open("rb") as f:
        resp = client.post(
            f"{BASE}/ingest/",
            data={"title": pdf.stem},
            files={"file": (pdf.name, f, "application/pdf")},
        )
    resp.raise_for_status()
    task_id = resp.json()["taskId"]
    print(f"      taskId = {task_id}")

    # ── Step 2：等待 ingest 完成 ─────────────────────────────────────────────
    print("[2/6] 等待處理完成 ...")
    task_result = poll_task(client, task_id)
    if task_result["status"] == "error":
        sys.exit(f"處理失敗：{task_result.get('error')}")

    result_data = task_result.get("result") or {}
    book_id = result_data.get("bookId") or result_data.get("document_id")
    if not book_id:
        # fallback：從 /books 找最新一本
        r = client.get(f"{BASE}/books")
        books = r.json() if r.content else []
        book_id = books[0]["id"] if books else None
    if not book_id:
        sys.exit("無法取得 bookId")
    print(f"      bookId = {book_id}")

    # ── 建立輸出資料夾 ────────────────────────────────────────────────────────
    out_dir = Path("output") / book_id
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"      輸出目錄 → {out_dir}/\n")

    # ── Step 3：逐一打 GET API，存結果 ──────────────────────────────────────
    print("[3/6] 抓取基本資料 ...")

    endpoints: list[tuple[str, str]] = [
        ("book_meta",   f"{BASE}/books/{book_id}"),
        ("chapters",    f"{BASE}/books/{book_id}/chapters"),
        ("entities",    f"{BASE}/books/{book_id}/entities"),
        ("relations",   f"{BASE}/books/{book_id}/relations"),
        ("graph",       f"{BASE}/books/{book_id}/graph"),
        ("analysis_characters", f"{BASE}/books/{book_id}/analysis/characters"),
        ("analysis_events",     f"{BASE}/books/{book_id}/analysis/events"),
    ]

    for name, url in endpoints:
        r = client.get(url)
        save(out_dir, name, {"status_code": r.status_code, "body": r.json() if r.content else None})

    # ── Step 4：抓第一章的 chunks ────────────────────────────────────────────
    print("[4/6] 抓第一章 chunks ...")
    chapters_data = json.loads((out_dir / "chapters.json").read_text())
    chapters = chapters_data["body"]
    if chapters:
        first_chapter_id = chapters[0]["id"]
        r = client.get(f"{BASE}/books/{book_id}/chapters/{first_chapter_id}/chunks")
        save(out_dir, "chapter_1_chunks", {"status_code": r.status_code, "body": r.json() if r.content else None})
    else:
        print("  (無章節資料)")

    # ── Step 5：搜尋測試 ─────────────────────────────────────────────────────
    print("[5/6] 語意搜尋測試 ...")
    r = client.post(f"{BASE}/search/", json={"bookId": book_id, "query": "主角", "topK": 5})
    save(out_dir, "search_sample", {"status_code": r.status_code, "body": r.json() if r.content else None})

    # ── Step 6：產生摘要（ingest 完成後已有，直接撈）────────────────────────
    print("[6/6] 完成！\n")
    print(f"所有結果已存至 {out_dir}/")
    print("  book_meta.json            — 書籍 metadata、摘要、統計數字")
    print("  chapters.json             — 章節列表與摘要")
    print("  chapter_1_chunks.json     — 第一章 chunks 與實體標記")
    print("  entities.json             — 所有實體")
    print("  relations.json            — 所有關係")
    print("  graph.json                — 知識圖譜節點與邊")
    print("  analysis_characters.json  — 角色分析清單")
    print("  analysis_events.json      — 事件分析清單")
    print("  search_sample.json        — 語意搜尋「主角」結果")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("用法：python scripts/explore_api.py path/to/book.pdf")
    main(sys.argv[1])
