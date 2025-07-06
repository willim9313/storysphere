# pipeline/doc_preprocessing/chapter_splitter.py
"""
章節擷取模組：提供各種常見章節標題的匹配與抽取
"""
import re
from typing import List, Dict, Optional


class ChapterPattern:
    def __init__(self, name: str, pattern: str):
        self.name = name
        self.regex = re.compile(pattern, flags=re.IGNORECASE)

    def match(self, line: str) -> Optional[Dict]:
        m = self.regex.match(line.strip())
        if not m:
            return None

        chapter_number = None
        chapter_title = None

        if self.name == "chinese_number":
            chapter_number = m.group(1)
            chapter_title = m.group(2).strip() if m.lastindex >= 2 else None
        elif self.name == "arabic_english":
            chapter_number = m.group(2)
        elif self.name == "chapter_with_title":
            chapter_number = m.group(1)
            chapter_title = m.group(2).strip()
        elif self.name == "hyphen_number":
            chapter_number = m.group(1)
        elif self.name == "volume_chapter":
            chapter_number = f"{m.group(1)} {m.group(2)}, {m.group(3)} {m.group(4)}"
        elif self.name == "roman_english":
            chapter_number = m.group(2)
        elif self.name == "chapter_with_roman_title":
            chapter_number = m.group(2)
            chapter_title = m.group(3).strip() if m.lastindex >= 3 else None

        return {
            "match_type": self.name,
            "chapter_number": chapter_number,
            "chapter_title": chapter_title,
            "full_line": line.strip()
        }


class ChapterExtractor:
    def __init__(self):
        self.patterns = [
            ChapterPattern("chinese_number", r'^\s*(第\s*[\d一二三四五六七八九十百千萬零〇]+章)\s*(.*)$'),
            ChapterPattern("arabic_english", r'^\s*(Chapter|Ch\.|CHAPTER|Vol|Volume|Act|Scene|Book|Part)\s*(\d{1,4})\s*$'),
            ChapterPattern("chapter_with_title", r'^\s*(第\s*\d{1,4}\s*章|Chapter\s*\d{1,4}|Ch\.\s*\d{1,4})\s*[:\uFF1A\-\s]+(.+)$'),
            ChapterPattern("hyphen_number", r'^\s*(\d{1,4}[-—–]\d{1,4})\s*$'),
            ChapterPattern("volume_chapter", r'^\s*(Volume|Vol|Book|Part)\s*(\d{1,4}),?\s*(Chapter|Ch\.|Act|Scene)\s*(\d{1,4})\s*$'),
            ChapterPattern("roman_english", r'^\s*(Chapter|Ch\.|CHAPTER)\s+([IVXLCDM]+)\s*$'),
            ChapterPattern("chapter_with_roman_title", r'^\s*(Chapter|Ch\.|CHAPTER)\s+(\d+|[IVXLCDM]+)\s*[:\-\uFF1A]?\s*(.*)$'),
        ]

    def extract(self, text: str) -> List[Dict]:
        lines = text.splitlines()
        chapters = []
        for i, line in enumerate(lines):
            for pattern in self.patterns:
                match = pattern.match(line)
                if match:
                    chapters.append({
                        "index": i,
                        "full_line": line.strip(),
                        "info": match
                    })
                    break
        return chapters
