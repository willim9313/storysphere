from typing import Callable, List, Dict, Any, Optional
import os
import json
from src.core.vector_process_store import generate_point_id

class HierarchicalAggregator:
    def __init__(
        self,
        doc_id: str,
        vector_store,
        aggregation_fn: Callable[[List[Any]], Any],
        input_type: str,
        input_field: str,
        output_type: str,
        output_field: str,
        json_output_path: Optional[str] = None,
        read_collection: Optional[str] = None,
        write_collection: Optional[str] = None,
    ):
        """
        通用的層級聚合工具，可用於 summary 或 keyword 聚合等

        :param doc_id: 資料集 ID（如書籍代號）
        :param vector_store: 實作 retrieve_by_filter 與 store_chunks 的資料存取層
            使用的是CustomVectorStore
        :param aggregation_fn: 聚合函數（如 LLM summary 或 keyword aggregator）
        :param input_type: Qdrant 中原始資料的 type 值（如 summary, keyword_scores）
        :param input_field: Qdrant 輸入的欄位名稱
            通常就是keyword_scores, summary
        :param output_type: 聚合後輸出的 type 值（如 chapter_summary）
        :param field_name: 儲存聚合結果的欄位名稱（如 summary, keywords_scores）
        :param json_output_path: 若有設定，聚合結果會輸出至 JSON
        :param read_collection: 讀取來源的 Qdrant collection 名稱
        :param write_collection: 儲存目標的 Qdrant collection 名稱
        """
        self.doc_id = doc_id
        self.vector_store = vector_store
        self.aggregation_fn = aggregation_fn
        self.input_type = input_type
        self.input_field = input_field
        self.output_type = output_type
        self.output_field = output_field
        self.json_output_path = json_output_path
        self.read_collection = read_collection or vector_store.collection_name
        self.write_collection = write_collection or vector_store.collection_name

    def aggregate_chapters(self, 
                           chapter_seqs: List[int], 
                           store_to_qdrant: bool = False) -> List[Dict[str, Any]]:
        '''
        只會從qdrant撈出資料後，輸出到qdrant的其他collection跟json
        '''
        print(f'Entire collection has {self.vector_store.count_points()} points.')

        for chapter_seq in chapter_seqs:
            results = []
            print(f"\n[INFO] 處理章節 {chapter_seq}...")
            
            # load data
            self.vector_store.set_collection(self.read_collection)
            chunks = self.vector_store.retrieve_by_filter(
                filter={
                    "doc_id": self.doc_id,
                    "chapter_seq": chapter_seq
                    }, 
                limit=500,
                collection=self.read_collection, 
                with_payload=[self.input_field,
                              'doc_id']) ####### 有點搞混當初輸入輸出欄位是哪些
            
            print(f"[INFO] 找到 {len(chunks)} 個 chunk summaries")
            print(f"[INFO] 第一個 chunk summary: {chunks[0]}")
            
            if not chunks:
                print(f"[WARN] 找不到章節 {chapter_seq} 的輸入資料")
                continue

            chunks = sorted(chunks, key=lambda x: x['payload'].get("chunk_id", 0))

            input_values = [c['payload'][self.input_field] for c in chunks if self.output_field in c['payload']]
            output = self.aggregation_fn(input_values) # core function operated

            if self.input_type == 'summary':
                record = {
                    "doc_id": self.doc_id,
                    "chapter_seq": chapter_seq, # 之後再看狀況加入chapter_number
                    self.output_field: output,
                    'type': self.output_type,
                    "source_chunk_ids": [c['id'] for c in chunks]
                }
            elif self.input_type == 'keyword_scores':
                keyword_list = [k for k in output.keys()]
                record = {
                    "doc_id": self.doc_id,
                    "chapter_seq": chapter_seq, # 之後再看狀況加入chapter_number
                    self.output_field: output,
                    'keywords': keyword_list,
                    'type': self.output_type,
                    "source_chunk_ids": [c['id'] for c in chunks]
                }
            else:
                print('ERROR')
                break
            results.append(record)

            # JSON append
            if self.json_output_path:
                os.makedirs(self.json_output_path, exist_ok=True)
                out_path = os.path.join(self.json_output_path, f"{self.output_type}s.json")
                existing = []
                if os.path.exists(out_path):
                    with open(out_path, "r", encoding="utf-8") as f:
                        try:
                            existing = json.load(f)
                        except json.JSONDecodeError:
                            existing = []
                existing.append(record)
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(existing, f, ensure_ascii=False, indent=2)

            if store_to_qdrant:
                self.vector_store.set_collection(self.write_collection)
                
                point_id = generate_point_id()
                if self.input_type == 'keyword':
                    chunk_target = keyword_list
                else:
                    chunk_target = output
                chunk_target = str(chunk_target)  # make sure it's a string
                self.vector_store.store_chunk(
                    point_id=point_id,
                    chunk=chunk_target,
                    metadata=record
                )

        return results

    def aggregate_book(self, 
                       doc_id: str, 
                       store_to_qdrant: bool = False) -> Dict[str, Any]:
        # 這邊需要更大幅度的改寫，因為來源可以有json或是qdrant
        # 寫出的位置也是
        print(f'Entire collection has {self.vector_store.count_points()} points.')
        print("\n[INFO] 聚合整本書...")
        # chapters = chapter_loader()
        
        # load data
        self.vector_store.set_collection(self.read_collection)
        chapters = self.vector_store.retrieve_by_filter(
            filter={
                "doc_id": doc_id
            },
            limit=500,
            collection=self.read_collection,
            with_payload=[self.input_field, 
                          "chapter_seq", 
                          "doc_id"]
        )

        if not chapters:
            print("[WARN] 無章節資料可用於聚合")
            return {}

        chapters = sorted(chapters, key=lambda x: x["payload"].get("chapter_seq", 0))
        print(chapters)
        input_values = [c["payload"][self.output_field] for c in chapters if self.output_field in c["payload"]]
        print(input_values)
        result = self.aggregation_fn(input_values)

        if self.input_type == 'summary':
            record = {
                "doc_id": self.doc_id,
                self.output_field: result,
                "type": self.output_type,
                "source_chunk_ids": [c["id"] for c in chapters]
            }
        elif self.input_type == 'keyword_scores':
            keyword_list = [k for k in result.keys()]
            record = {
                "doc_id": self.doc_id,
                self.output_field: result,
                "keywords": keyword_list,
                "type": self.output_type,
                "source_chunk_ids": [c["id"] for c in chapters]
            }

        # JSON output
        if self.json_output_path:
            os.makedirs(self.json_output_path, exist_ok=True)
            out_path = os.path.join(self.json_output_path, f"{self.output_type}.json")
            existing = []
            if os.path.exists(out_path):
                with open(out_path, "r", encoding="utf-8") as f:
                    try:
                        existing = json.load(f)
                    except json.JSONDecodeError:
                        existing = []
            existing.append(record)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)

        # Store to Qdrant
        if store_to_qdrant:
            self.vector_store.set_collection(self.write_collection)

            point_id = generate_point_id()
            if self.input_type == 'keyword':
                chunk_target = keyword_list
            else:
                chunk_target = result
            chunk_target = str(chunk_target)  # make sure it's a string
            self.vector_store.store_chunk(
                point_id=point_id,
                chunk=chunk_target,
                metadata=record
            )

        return record

    def load_chapter_outputs_from_json(self) -> List[Dict[str, Any]]:
        if not self.json_output_path:
            print("[ERROR] 未設定 json_output_path，無法讀取")
            return []

        path = os.path.join(self.json_output_path, f"{self.output_type}s.json")
        if not os.path.exists(path):
            print(f"[WARN] 找不到檔案：{path}")
            return []

        with open(path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                print(f"[ERROR] JSON 格式錯誤：{path}")
                return []

if __name__ == "__main__":
    # 這裡可以放一些測試代碼，確保 HierarchicalAggregator 的功能正常
    

    # 開始撰寫summary聚合流程
    # chapter summary
    from src.core.vector_process_store import CustomVectorStore
    from src.core.nlp_utils import LlmOperator
    from dotenv import load_dotenv
    from llm.gemini_client import GeminiClient

    load_dotenv()
    API_KEY = os.getenv("GEMINI_API_KEY")
    MODEL_NAME = os.getenv("GEMINI_MODEL")

    vs = CustomVectorStore(
        collection_name='Test_30p_Animal_Farm',
        encode_model='all-MiniLM-L6-v2',
        data=None)
    
    # chapter level summary
    client = LlmOperator(GeminiClient(API_KEY, MODEL_NAME))
    
    aggregator = HierarchicalAggregator(
        doc_id="f0b16578-b3fb-4979-8a0a-19e1f6338b53",
        vector_store=vs,
        aggregation_fn=client.summarize,
        input_type="summary",
        input_field='summary',
        output_type="chapter_summary",
        output_field="summary",
        json_output_path="./data/art/summary_outputs",
        read_collection="Test_30p_Animal_Farm",
        write_collection="Test_30p_Animal_Farm_chapter_summaries" #. 這邊可能有問題，因為store得部分沒有做好
    )
    res = vs.get_unique_metadata_values(key='chapter_seq')
    print(f'res = {res}')
    chapter_seqs = list(res)

    aggregator.aggregate_chapters(chapter_seqs=chapter_seqs,
                                  store_to_qdrant=True)
    

    # chapter level keyword
    from src.pipelines.nlp.keyword_aggregator import KeywordAggregator

    kw_aggregator = KeywordAggregator(top_n=10)    

    aggregator = HierarchicalAggregator(
        doc_id="f0b16578-b3fb-4979-8a0a-19e1f6338b53",
        vector_store=vs,
        aggregation_fn=kw_aggregator.aggregate,
        input_type="keyword_scores",
        input_field='keyword_scores',
        output_type="chapter_keyword",
        output_field="keyword_scores",
        json_output_path="./data/art/keyword_outputs",
        read_collection="Test_30p_Animal_Farm",
        write_collection="Test_30p_Animal_Farm_chapter_keyword" #. 這邊可能有問題，因為store得部分沒有做好
    )
    res = vs.get_unique_metadata_values(key='chapter_seq')
    print(f'res = {res}')
    chapter_seqs = list(res)

    aggregator.aggregate_chapters(chapter_seqs=chapter_seqs,
                                  store_to_qdrant=True)
    

    # book level summary
    client = LlmOperator(GeminiClient(API_KEY, MODEL_NAME))
    
    aggregator = HierarchicalAggregator(
        doc_id="f0b16578-b3fb-4979-8a0a-19e1f6338b53",
        vector_store=vs,
        aggregation_fn=client.summarize,
        input_type="summary",
        input_field='summary',
        output_type="book_summary",
        output_field="summary",
        json_output_path="./data/art/summary_outputs",
        read_collection="Test_30p_Animal_Farm_chapter_summaries",
        write_collection="Test_30p_Animal_Farm_book_summaries" #. 這邊可能有問題，因為store得部分沒有做好
    )
    res = vs.get_unique_metadata_values(key='chapter_seq')
    print(f'res = {res}')
    chapter_seqs = list(res)

    aggregator.aggregate_book(doc_id="f0b16578-b3fb-4979-8a0a-19e1f6338b53", # 其實應該可不用的
                              store_to_qdrant=True)
    

    # book level keyword
    from src.pipelines.nlp.keyword_aggregator import KeywordAggregator

    kw_aggregator = KeywordAggregator(top_n=10)    

    aggregator = HierarchicalAggregator(
        doc_id="f0b16578-b3fb-4979-8a0a-19e1f6338b53",
        vector_store=vs,
        aggregation_fn=kw_aggregator.aggregate,
        input_type="keyword_scores",
        input_field='keyword_scores',
        output_type="book_keyword",
        output_field="keyword_scores",
        json_output_path="./data/art/keyword_outputs",
        read_collection="Test_30p_Animal_Farm_chapter_keyword",
        write_collection="Test_30p_Animal_Farm_book_keyword" #. 這邊可能有問題，因為store得部分沒有做好
    )
    res = vs.get_unique_metadata_values(key='chapter_seq')
    print(f'res = {res}')
    chapter_seqs = list(res)

    aggregator.aggregate_book(doc_id="f0b16578-b3fb-4979-8a0a-19e1f6338b53", # 其實應該可不用的
                              store_to_qdrant=True)
    
    # collection summary
    # 開始撰寫keyword聚合流程，後續這塊pipeline會被拉出去成獨立用途