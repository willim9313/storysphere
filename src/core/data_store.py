"""
# data_store.py
# 負責處理文本資料的儲存與索引。
包含文本的章節匹配、章節萃取class
"""
# 標準函式庫
import re
import uuid
import json
from pathlib import Path

# 第三方套件
from llama_index.core import (Document, 
                              VectorStoreIndex, 
                              ServiceContext, 
                              SimpleDirectoryReader)
from llama_index.core.text_splitter import TokenTextSplitter


# 型別提示
from typing import Optional, List, Dict
from pydantic import BaseModel


# 專案自訂模組
from src.core.vector_process_store import CustomVectorStore, generate_point_id
from src.core.nlp_utils import LlmOperator, KpeTool
from llm.gemini_client import GeminiClient

from dotenv import load_dotenv
import os
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")


class ChapterPattern:
    """
    單一章節匹配器
    """
    def __init__(self, name: str, pattern: str):
        self.name = name
        self.regex = re.compile(pattern, flags=re.IGNORECASE)

    def match(self, line: str) -> Optional[Dict]:
        m = self.regex.match(line.strip())
        if not m:
            return None

        # 根據不同類型進行通用提取
        # 可根據具體需求調整
        chapter_number = None
        chapter_title = None

        if self.name in ["chinese_number"]:
            chapter_number = m.group(1)
            chapter_title = m.group(2).strip() if m.lastindex >= 2 else None

        elif self.name in ["arabic_english"]:
            chapter_number = m.group(2)

        elif self.name in ["chapter_with_title"]:
            chapter_number = m.group(1)
            chapter_title = m.group(2).strip()

        elif self.name in ["hyphen_number"]:
            chapter_number = m.group(1)

        elif self.name in ["volume_chapter"]:
            chapter_number = f"{m.group(1)} {m.group(2)}, {m.group(3)} {m.group(4)}"

        elif self.name in ["pure_title"]:
            chapter_title = m.group(1)

        elif self.name in ["roman_english"]:
            chapter_number = m.group(2)

        elif self.name in ["chapter_with_roman_title"]:
            chapter_number = m.group(2)
            chapter_title = m.group(3).strip() if m.lastindex >= 3 else None

        return {
            "match_type": self.name,
            "chapter_number": chapter_number,
            "chapter_title": chapter_title,
            "full_line": line.strip()
        }


class ChapterExtractor:
    """
    章節抽取器：管理所有 Pattern
    """
    def __init__(self):
        self.patterns = [
            ChapterPattern("chinese_number", r'^\s*(第\s*[\d一二三四五六七八九十百千萬零〇]+章)\s*(.*)$'),
            ChapterPattern("arabic_english", r'^\s*(Chapter|Ch\.|CHAPTER|Vol|Volume|Act|Scene|Book|Part)\s*(\d{1,4})\s*$'),
            ChapterPattern("chapter_with_title", r'^\s*(第\s*\d{1,4}\s*章|Chapter\s*\d{1,4}|Ch\.\s*\d{1,4})\s*[:：\-\s]+(.+)$'),
            ChapterPattern("hyphen_number", r'^\s*(\d{1,4}[-—–]\d{1,4})\s*$'),
            ChapterPattern("volume_chapter", r'^\s*(Volume|Vol|Book|Part)\s*(\d{1,4}),?\s*(Chapter|Ch\.|Act|Scene)\s*(\d{1,4})\s*$'),
            # ChapterPattern("pure_title", r'^\s*([^\d\s]{2,30})\s*$'),
            ChapterPattern("roman_english", r'^\s*(Chapter|Ch\.|CHAPTER)\s+([IVXLCDM]+)\s*$'),
            ChapterPattern("chapter_with_roman_title", r'^\s*(Chapter|Ch\.|CHAPTER)\s+(\d+|[IVXLCDM]+)\s*[:\-]?\s*(.*)$'),
        ]

    def extract(self, text: str) -> List[Dict]:
        # print(f'text={text}')
        lines = text.splitlines()
        # print(f'lines={lines}')
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


def normalize_text(text):
    # 將所有連續的空白字符（包括換行符）替換成一個空格
    # 抓取章節時，如果使用了會造成無法判別分段的問題
    # 暫時不用
    return re.sub(r'\s+', ' ', text).strip()

class DocStore:
    def __init__(self, file_path: str, collection_name: str):
        self.file_path = file_path # 文件路徑
        self.collection_name = collection_name # Qdrant collection 名稱
        self.doc_id = None # 文件的唯一識別碼
        self.documents = None # 文件經過切分後儲存成Document物件的list
        self.text_splitter = None #
        self.chapter_extractor = None
        self.nlp_llm_client = None # 負責執行所有 NLP 相關任務的 LLM 客戶端
        self.keyphrase_extractor = None # 負責關鍵字萃取的工具
        self.all_chunks = [] # 儲存所有處理後的 chunk，包含 metadata

    def load_doc(self, limit_pages: Optional[int] = None):
        reader = SimpleDirectoryReader(input_dir=self.file_path,
                                       required_exts=[".pdf", ".docx"],
                                       )
        self.documents = reader.load_data()
        self.documents = [doc for doc in self.documents if len(doc.text) > 0]  # 過濾掉空文本
        if limit_pages is not None:
            self.documents = self.documents[:limit_pages]
        
        self.doc_id = generate_point_id()  # 為整個文檔生成一個唯一的 ID
        print(f'Load doc complete, doc len = {len(self.documents)} \n', '-'*20)

    def set_text_splitter(self):
        self.text_splitter = TokenTextSplitter(chunk_size=512, chunk_overlap=50)

    def set_kpe(self):
        self.keyphrase_extractor = KpeTool()
        return None

    def set_chapter_extractor(self):
        """
        初始化章節萃取器
        """
        self.chapter_extractor = ChapterExtractor()
        return None

    def set_nlp_llm_client(self):
        """
        初始化 NLP LLM 客戶端
        """
        self.nlp_llm_client = LlmOperator(GeminiClient(API_KEY, MODEL_NAME))
        return None

    def test_flow(self):
        # 後面要移除
        extractor = ChapterExtractor()
        for i, doc in enumerate(self.documents):
            print(f'doc i = {i}')
            normalized_text = doc.text
            chapters = extractor.extract(normalized_text)
            for j, ex in enumerate(chapters):
                print(f'sdoc ={j}, \n')
                print(ex, '\n')
            print('\n-------------------\n')

    def transform_kg_elements(self, chunk_id: str,
                          kg_elements: List[BaseModel],
                          type: str) -> Dict:
        """
        根據 type 處理 KG 的 entities 或 relations，回傳統一格式結構。

        :param chunk_id: 對應的文件 ID
        :param kg_elements: 經過 Pydantic 驗證的模型資料
        :param type: 'entities' 或 'relations'
        :return: Dict格式的轉換後資料，因為一次只會處理一個chunk
        """
        results = []

        if type == 'entities':
            entities_list = []
            for ent in kg_elements:
                # 這是可以不用isinstance的，因為kg_elements已經是經過Pydantic驗證的模型.
                ent_name = ent.name.strip() if ent.name else ""
                if ent_name:
                    attributes = getattr(ent, "attributes", {})
                    attributes = attributes.model_dump() if attributes else {}
                    entities_list.append(
                        {
                            "type": getattr(ent, "type", "Other"),
                            "name": getattr(ent, "name", ""),
                            "attributes": attributes
                        }
                    )

            results = {
                "chunk_id": chunk_id,
                "entities": entities_list
                }
            

        elif type == 'relations':
            rels = []
            for rel in kg_elements:
                head = rel.head.strip() if rel.head else ""
                relation = rel.relation.strip() if rel.relation else ""
                tail = rel.tail.strip() if rel.tail else ""
                if head and relation and tail:
                    rels.append({
                        "chunk_id": chunk_id,
                        "head": head,
                        "relation": relation,
                        "tail": tail
                    })
            results = {
                "chunk_id": chunk_id,
                "relation_set": rels
            }
        elif type == 'original':
            # 如果是原始的 kg_elements，直接返回其 model_dump 結果
            results = kg_elements.model_dump()
        else:
            raise ValueError(f"Unsupported type: {type}")

        return results

    
    def extract_chapters(self, text: str):
        """
        從文本中提取章節資訊，返回章節資訊、切分後文本和章節索引。
        """
        chapter_infos = self.chapter_extractor.extract(text)
        if not chapter_infos:
            # 如果沒有匹配到章節，整篇作為一章
            chapter_infos = [{"index": 0, "full_line": "unknown", "info": None}]
            lines = text.splitlines()
        else:
            lines = text.splitlines()

        # 添加最後一個章節邊界
        chapter_indices = [c["index"] for c in chapter_infos] + [len(lines)]
        return chapter_infos, lines, chapter_indices
    
    def store_kg_data(self, kg_elements: List, file_path: str):
        """
        將知識圖譜元素存儲到指定的 JSON 檔案中。
        這邊是採用讀取新增方式，將新的知識圖譜元素追加到檔案中。
        :param kg_elements: 知識圖譜元素列表
        :param file_path: 存儲檔案的路徑
        """

        # 1. 設定檔案路徑
        file_path = Path(file_path)  # 根據你實際路徑調整

        # 2. 讀取既有 JSON 檔案（若不存在則用空 list 初始化）
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = []

        # 3. 新增一筆資料
        data.append(kg_elements)

        # 4. 寫回檔案（覆蓋寫入）
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

        print("資料已新增並儲存。")
        return None


    def run_workflow(self):

        if not self.documents:
            raise ValueError("No documents loaded. Please load documents first. Using load_doc() method.")
        
        print(f'len of self.documents = {len(self.documents)}')

        # 定義一個內部函數，用於合併多個 Document 為單一 Document
        # def merge_documents(docs: list) -> Document:
        #     """
        #     將多個分頁 Document 合併為單一 Document。
        #     保留第一頁的 metadata（或可自定）。
        #     """
        #     combined_text = "\n\n".join(doc.text for doc in docs)
        #     metadata = docs[0].metadata if docs else {}
        #     return Document(text=combined_text, metadata=metadata)
        

        def merge_documents(docs: list[Document]) -> Document:
            print(f'[debug] merging {len(docs)} docs...')  # 新增這行
            combined_text = "\n\n".join(doc.text for doc in docs)
            metadata = docs[0].metadata if docs else {}
            return Document(text=combined_text, metadata=metadata)


        print('type(self.documents) = ', type(self.documents))
        # 正確傳入原始的 Document 物件，而不是只取 .text
        self.documents = [merge_documents(self.documents)]
                
    
        print(f'len of self.documents after merge = {len(self.documents)}')

        ############ 重新寫flow ##########
        # 一個doc_seq可能是頁數
        for doc_seq, doc in enumerate(self.documents):
            # predefine metadata structure, 確保依序抓取chapter pattern時能接續前一章節的判斷
            metadata = {
                        "doc_id": self.doc_id,
                        "doc_seq": doc_seq, # 預計用於紀錄同個doc_id中的文件順序
                        "chapter_seq": None, 
                        "chunk_seq": None,
                        "chunk_id": None,
                        "chapter_match_type": None,
                        "chapter_number": None,
                        "chapter_title": None,
                        "chunk": None, # 可能重新命名為chunk
                        "keywords": None,
                        "keyword_scores": None,
                        "summary": None, # future features
                        "roles": None # future features
                        }

            print(f'doc_seq = {doc_seq}')
            # 章節切分與處理
            chapter_infos, lines, chapter_indices = self.extract_chapters(doc.text)
            print(f'len of chapter_infos = {len(chapter_infos)}')
            print(f'chapter_infos = {chapter_infos}')
            print('#'*10)
            print(f'len of lines = {len(lines)}')
            print(f'len of chapter_indices = {len(chapter_indices)}')


            # 如果章節截取有內文，進行逐章切割
            for idx in range(len(chapter_infos)):
                chapter_lines = lines[chapter_indices[idx]:chapter_indices[idx+1]]
                chapter_text = "\n".join(chapter_lines).strip()
                chunk = chapter_infos[idx]['full_line']
                print(f'chapter_lines = {chapter_lines}')
                print(f'chapter_text = {chapter_text}')
                print(f'chunk = {chunk}')
                if chapter_infos[idx]['info'] is not None:
                    chapter_match_type = chapter_infos[idx]['info'].get('match_type', None)
                    chapter_number = chapter_infos[idx]['info'].get('chapter_number', None)
                    chapter_title = chapter_infos[idx]['info'].get('chapter_title', None)
                else:
                    chapter_match_type = None
                    chapter_number = None
                    chapter_title = None
                    # 這邊可能有問題，如果info裡面沒有東西，上述三種內容都會出錯
                # print('#'*20)
                # print(f'chapter_match_type = {chapter_match_type}')
                # print(f'chapter_number = {chapter_number}')
                # print(f'chapter_title = {chapter_title}')
                # print(f'chapter_fullline = {chapter_fullline}')
                # print('#'*20)

                # custom chunking，可能是chapter底下在做額外chunking
                chunks = self.text_splitter.split_text(chapter_text)
                for chunk_seq, chunk in enumerate(chunks):    
                    # 為每個 chunk 生成唯一 ID，注意 很重要！！！
                    # 因為跨資料庫連結會用到這個 ID
                    chunk_id = generate_point_id()

                    # 關鍵字萃取
                    keywords_scores = self.keyphrase_extractor.extract_keywords(chunk)
                    keywords = [kw for kw in keywords_scores.keys()]
                    # keywords = 'test'

                    # 摘要萃取
                    summary = self.nlp_llm_client.summarize(chunk)
                    # summary = 'test'

                    # 知識圖譜相關萃取
                    kg_elements = self.nlp_llm_client.extract_kg_elements(chunk)
                    print(kg_elements)
                    if kg_elements: # 可能超過次數還是失敗，會回傳 None
                        kg_entity_set = kg_elements.entities
                        kg_relation_set = kg_elements.relations

                        roles = [role.name for role in kg_entity_set if role.type == 'Person']
                    else:
                        kg_entity_set = None
                        kg_relation_set = None
                        roles = None
                    
                    # update metadata
                    metadata['chapter_seq'] = idx
                    metadata['chunk_seq'] = chunk_seq
                    metadata['chunk_id'] = chunk_id
                    metadata['chapter_match_type'] = chapter_match_type
                    metadata['chapter_number'] = chapter_number
                    metadata['chapter_title'] = chapter_title
                    metadata['chunk'] = chunk
                    metadata['keywords'] = keywords
                    metadata['keyword_scores'] = keywords_scores
                    metadata['summary'] = summary
                    metadata['roles'] = roles
                    
                    if kg_entity_set:
                        neo_kg_entity_set = self.transform_kg_elements(chunk_id=chunk_id,
                                                                    kg_elements=kg_entity_set,
                                                                    type='entities')
                        # update kg_entity_set and store
                        self.store_kg_data(neo_kg_entity_set, file_path='./data/kg_storage/kg_entity_set.json')

                    if kg_relation_set:
                        neo_kg_relation_set = self.transform_kg_elements(chunk_id=chunk_id,
                                                                    kg_elements=kg_relation_set,
                                                                    type='relations')
                        # update kg_relation_set and store
                        self.store_kg_data(neo_kg_relation_set, file_path='./data/kg_storage/kg_relation_set.json')

                    if kg_elements:
                        # 儲存最原始的結構，但是附帶上chunk_id
                        kg_elements.chunk_id = chunk_id
                        neo_kg_elements = self.transform_kg_elements(chunk_id=chunk_id,
                                                                    kg_elements=kg_elements,
                                                                    type='original')
                        # update kg_elements and store
                        self.store_kg_data(neo_kg_elements, file_path='./data/kg_storage/kg_elements.json')

                    # store to qdrant
                    vs = CustomVectorStore(self.collection_name)
                    pprint(f'#### metadata = {metadata} ####')
                    vs.store_chunk(point_id=chunk_id,
                                   chunk=chunk,
                                   metadata=metadata)

        self.nlp_llm_client.close() # 關閉 LLM 客戶端連線

    def index_store(self):
        # 暫時沒有使用
        # 需要確認用途
        # 這邊還不完整
        # 配置服務上下文
        service_context = ServiceContext.from_defaults(chunk_size=512)
        # 使用新版的 VectorStoreIndex 創建索引
        index = VectorStoreIndex.from_documents(self.all_chunks, service_context=service_context)
        index.storage_context.persist(persist_dir="./vector_index_storage")
    
    def index_store_qdrant(self, data):
        # 暫時沒有使用
        # 目前都先寫在workflow中，後面要想為什麼需要拆出來
        """
        將 run_workflow 產生的所有 chunk 上傳至 Qdrant 的 vector DB，
        每個 chunk 都會被 embed 並附上原有的 metadata。
        """
        # 假設 VectorStore 類別在同一個 module 中，或已正確 import
        vs = CustomVectorStore(self.collection_name)
        # 這裡用 enumerate 產生一個整數作為 doc_id，每個 chunk 皆獨立上傳
        for i, chunk_doc in enumerate(self.all_chunks):
            vs.store_chunks(doc_id=chunk_doc.doc_id, 
                            chunks=[chunk_doc.text], 
                            metadata=chunk_doc.metadata)

    # def update_metadata_in_qdrant(self, collection_name: str, node_id: str, new_metadata: Dict):
    #     """
    #     更新 Qdrant 中指定 node_id 的 metadata。

    #     :param collection_name: Qdrant 中的 collection 名稱
    #     :param node_id: 要更新的節點 ID
    #     :param new_metadata: 要更新的 metadata 字典
    #     """
    #     # 初始化 VectorStore
    #     vs = VectorStore(collection_name)

    #     # 獲取當前的節點資料
    #     node = vs.get_node_by_id(node_id)
    #     if not node:
    #         print(f"Node with ID {node_id} not found in collection {collection_name}.")
    #         return

    #     # 更新 metadata
    #     updated_metadata = {**node.metadata, **new_metadata}
    #     vs.update_node_metadata(node_id=node_id, metadata=updated_metadata)

    #     print(f"Metadata for node {node_id} updated successfully.")
    def workflow_update_metadata(self, collection_name: str):
        import pandas as pd
        collection_name = "Animal Farm"
        entity_df = pd.read_csv("./data/kg_storage/entity_df.csv")

        
        for doc_id in entity_df.doc_id.unique():
            temp_df = entity_df[entity_df.doc_id == doc_id][['canonical_entity','entity_type']]
            target = {'entities': 
                    [{'text': row['canonical_entity'], 
                        'type': row['entity_type']} for _, row in temp_df.iterrows()]
                        }
            
            # 組成此格式 {"entities": [{"text": "John Smith", "type": "PERSON"}, ...]}
            doc_id = 21436896000 # 臨時，之後要重改
            self.update_metadata_in_qdrant(collection_name=collection_name, node_id=doc_id, new_metadata=target)
            print(f'complete update metadata for doc_id = {doc_id}')
        return None

    def update_metadata_in_qdrant(self, collection_name: str, node_id: str, new_metadata: Dict):
        # 還沒有測試過
        """
        更新 Qdrant 中指定 node_id 的 metadata，並整合 NER 結果。

        :param collection_name: Qdrant 中的 collection 名稱
        :param node_id: 要更新的節點 ID
        :param new_metadata: 要更新的 metadata 字典（可包含 'entities' 欄位）
                            格式: {"entities": [{"text": "John Smith", "type": "PERSON"}, ...]}
        """
        # 初始化 VectorStore
        vs = CustomVectorStore(collection_name)

        # 獲取當前的節點資料
        node = vs.get_node_by_id(node_id)  # Replace with the actual method name
        if not node:
            print(f"Node with ID {node_id} not found in collection {collection_name}.")
            return

        # 預處理 NER 實體（若有）
        if "entities" in new_metadata:
            entities = new_metadata["entities"]
            entity_names = list({e["text"] for e in entities if "text" in e})
            entity_types = list({e["type"] for e in entities if "type" in e})
            # 加入冗餘欄位以利搜尋
            new_metadata["entity_names"] = entity_names
            new_metadata["entity_types"] = entity_types

        # 合併 metadata
        print(node)
        updated_metadata = {**node['payload'], **new_metadata}
        vs.update_node_metadata(node_id=node_id, new_metadata=updated_metadata)


if __name__ == "__main__":
    from pprint import pprint
    path = '/Users/williamhuang/projects/storysphere/data/novella/'
    ds = DocStore(path, collection_name="Test_30p_Animal_Farm")
    ds.load_doc(limit_pages=15) # total = 109
    ds.set_text_splitter()
    ds.set_chapter_extractor()
    ds.set_nlp_llm_client()
    # for doc in ds.documents:
    #     print(doc)
    ds.set_kpe()
    ds.run_workflow()
    # ds.index_store_qdrant(collection_name="Animal Farm")

    # ds.workflow_update_metadata(collection_name="Animal Farm")
