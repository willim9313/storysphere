# core/utils/id_generator.py
"""
提供唯一 ID 生成工具，用於 Qdrant 向量資料儲存等用途。
"""
import uuid
import hashlib


def generate_uuid_id() -> str:
    """生成 UUID 字串作為 chunk_id。"""
    return str(uuid.uuid4())


def generate_hash_id(doc_id: str, chunk_index: int) -> int:
    """
    根據 doc_id 與 chunk_index 生成整數型唯一 ID，適合用於 Qdrant integer ID。
    使用 MD5 將 doc_id 雜湊後取前 8 碼，加上 chunk_index。
    """
    doc_id_str = str(doc_id)
    hash_digest = hashlib.md5(doc_id_str.encode("utf-8")).hexdigest()
    base_id = int(hash_digest[:8], 16)
    return base_id * 1000 + chunk_index
