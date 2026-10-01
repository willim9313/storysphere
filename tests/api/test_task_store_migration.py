"""SQLiteTaskStore 對舊庫的就地遷移。

`var/tasks.db` 是使用者資料（被 .gitignore 忽略，git 救不了），升級不能要求砍掉重建。
`_ensure_init()` 對每個後加的欄位跑一次 `ALTER TABLE ... ADD COLUMN`，已存在就略過。
"""

from __future__ import annotations


class TestMigration:
    """`var/tasks.db` 是使用者資料，升級時不能要求砍掉重建 —— 缺欄位、舊格式的舊庫
    要在第一次存取時被補上，舊列讀回來是 None，新寫的終態才有值。"""

    def test_db_without_the_column_is_migrated_in_place(self, tmp_path):
        import sqlite3

        from storysphere.api.store import SQLiteTaskStore

        db_path = tmp_path / "tasks.db"
        with sqlite3.connect(db_path) as db:
            # 2026-10 之前的欄位集合（沒有 finished_at）。
            db.execute(
                "CREATE TABLE tasks (task_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', "
                "progress INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT '', sub_progress INTEGER, "
                "sub_total INTEGER, sub_stage TEXT, result TEXT, error TEXT, "
                "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')), "
                "kind TEXT, title TEXT, step_key TEXT)"
            )
            db.execute("INSERT INTO tasks (task_id, status) VALUES ('old', 'done')")

        store = SQLiteTaskStore(str(db_path))
        assert store.get("old").finished_at is None

        store.create("new")
        store.set_completed("new", {})
        assert store.get("new").finished_at is not None

    def test_old_created_at_gains_the_utc_marker(self, tmp_path):
        """舊列的 created_at 本來就是 UTC（SQLite 的 'now'），只缺 Z；補上後不變更時間本身。"""
        import sqlite3

        from storysphere.api.store import SQLiteTaskStore

        db_path = tmp_path / "tasks.db"
        SQLiteTaskStore(str(db_path)).create("seed")  # 建表
        with sqlite3.connect(db_path) as db:
            db.execute("INSERT INTO tasks (task_id, created_at) VALUES ('old', '2026-09-30T12:00:00')")

        store = SQLiteTaskStore(str(db_path))  # 新實例 → 重跑 _ensure_init
        assert store.get("old").created_at == "2026-09-30T12:00:00Z"
        # 冪等：再跑一次不會變成 ZZ
        assert SQLiteTaskStore(str(db_path)).get("old").created_at == "2026-09-30T12:00:00Z"

