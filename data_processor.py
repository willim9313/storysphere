# todo: replace dict with orderedict, in case the content of chapters switch

import re
from pypdf import PdfReader
from pprint import pprint
from abc import ABC, abstractmethod
from collections import OrderedDict
import os

class DataProcessor(ABC):
    def __init__(self):
        pass
    def _load_data(self):
        pass
    @abstractmethod
    def extract_chapters(self):
        pass

class PDFProcessor(DataProcessor):
    def __init__(self, pdf_path, chunk_size: int = 1000):
        """Initialize the PDF processor with a specified chunk size."""
        self.pdf_path = pdf_path
        self.chunk_size = chunk_size
        self.chapter_pattern = re.compile(r"(Chapter \d+)\s*(?:[:\n]+\s*([A-Za-z\s']{1,30}))?", re.IGNORECASE)
        # 這邊還不需要chunk
        # 目前chapter_pattern沒有用處
        self._metadata_overview = dict()

        self._chapter_info = OrderedDict() # 存放chapter, chapter_name的dict
        self.metadata_base = [] # 目標放入多個metadata
        self.chapter_text = [] # 同上，目標為基本按照章節拆分出來的結果進行區分

        self.reader = None

        # initialize basic info of whole doc
        self._load_data()
        self._extract_overview_info()

    def _load_data(self):
        try:
            reader =  PdfReader(self.pdf_path)
            self.reader = reader
        except:
            print(f"PdfReader failed loading, pdf_path = {self.pdf_path}")

    def _extract_overview_info(self):
        """
        Extract overview for the entire pdf file,
        """
        metadata_overview = {
            "filename": os.path.basename(self.pdf_path),
            "num_pages": len(self.reader.pages),
            "title": self.reader.metadata.get('/Title', ''),
            "author": self.reader.metadata.get('/Author', ''),
            "creation_date": self.reader.metadata.get('/CreationDate', '')
        }
        self.metadata_overview = metadata_overview

    def extract_chapters(self, title_word_limit=5):
        chapters = {}  # 存儲 {chapter_number: (chapter_title, page_number)}
        text_data = {}
        
        current_chapter_number = None
        current_chapter_content = []
        
        for i, page in enumerate(self.reader.pages):
            text = page.extract_text()
            if not text:
                continue

            # 移除換頁符號，保持原始段落結構
            text = text.replace("\x0c", "").strip()
            
            # 依據換行符拆分文本，以識別標題是否位於獨立行
            lines = text.split("\n")
            
            for idx, line in enumerate(lines):
                line = line.strip()
                chapter_match = re.match(r"^(Chapter \d+)(?:[:]?\s*(.*))?$", line, re.IGNORECASE)
                
                if chapter_match:
                    # 當前有記錄的章節，先存儲內容
                    if current_chapter_number:
                        text_data[current_chapter_number] = " ".join(current_chapter_content).strip()
                    
                    # 初始化新章節
                    chapter_number = chapter_match.group(1).strip()
                    chapter_title = chapter_match.group(2).strip() if chapter_match.group(2) else "Unknown Title"
                    
                    # 嘗試擷取下一行作為標題（如果當前行可能不完整）
                    if not chapter_match.group(2) and idx + 1 < len(lines):
                        potential_title = lines[idx + 1].strip()
                        if re.match(r"^[A-Za-z\s']{2,30}$", potential_title):  # 確保標題不包含多餘內容
                            chapter_title = potential_title
                    
                    # 限制標題長度
                    chapter_title = " ".join(chapter_title.split()[:title_word_limit])
                    chapters[chapter_number] = (chapter_title, i + 1)
                    text_data[chapter_number] = []  # 初始化章節內容存儲
                    
                    # 更新當前章節狀態
                    current_chapter_number = chapter_number
                    current_chapter_content = []
                    continue  # 跳過標題行，不納入內容
                    
                # 添加內容到當前章節
                if current_chapter_number:
                    current_chapter_content.append(line)

        # 存儲最後一個章節的內容
        if current_chapter_number:
            text_data[current_chapter_number] = " ".join(current_chapter_content)#.strip()
            
        self._chapter_info = chapters
        self.chapter_text = text_data
        # append chapters base metadata
        self._create_metadata_base()

    def _create_metadata_base(self):
        metadatabaselist = []
        for chapter_num in self.chapter_text.keys():
            metadatabaselist.append({'chapternum': chapter_num,
                                     'chaptername': self.chapter_info[chapter_num],
                                     'author': self.metadata_overview['author'],
                                     'title': self.metadata_overview['title'],
                                     'creation_date': self.metadata_overview['creation_date']
                                     })
            
        self.metadata_base = metadatabaselist
    @property
    def metadata_overview(self):
        return self._metadata_overview
    
    @metadata_overview.setter
    def metadata_overview(self, new_value: dict):
        self._metadata_overview = new_value

    @property
    def chapter_info(self):
        return self._chapter_info
    