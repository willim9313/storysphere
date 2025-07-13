from src.core.vector_process_store import CustomVectorStore
from src.core.nlp_utils import LlmOperator
from dotenv import load_dotenv
from src.core.llm.gemini_client import GeminiClient
import os

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")

client = LlmOperator(GeminiClient(API_KEY, MODEL_NAME))


# 實際上我們需要用chapter_seq來找，因為chapter_number可能為空，所以要先拿到chapter_seq
vs = CustomVectorStore(
    collection_name='Test_collection_set',
    encode_model='all-MiniLM-L6-v2',
    data=None)

res = vs.get_metadata_value_counts(key='chapter_seq')
print(f'res = {res}')

res = vs.get_unique_metadata_values(key='chapter_seq')
print(f'res = {res}')


read_collection = "Test_30p_Animal_Farm"
write_collection = "test_aggregation"
aggregation_fn=client.summarize
field_name = 'summary'


chapter_seqs = list(res)


# results = []

print(f'basic vs.count_points = {vs.count_points()}')

for chapter_seq in chapter_seqs:
    results = []
    print(f"\n[INFO] 處理章節 {chapter_seq}...")

    vs.set_collection(read_collection)
    chunks = vs.retrieve_by_filter(
        filter={
            "chapter_seq": chapter_seq,
            }, 
        limit=500,
        collection=read_collection,
        with_payload=['summary'])
    
    print(f"[INFO] 找到 {len(chunks)} 個 chunk summaries")
    print(f"[INFO] 第一個 chunk summary: {chunks[0]}")

    chunks = sorted(chunks, key=lambda x: x['payload'].get("chunk_id", 0))


    input_values = [c['payload'][field_name] for c in chunks if field_name in c['payload']]
    
    # output = client.summarize(input_values)
    output = aggregation_fn(input_values)

    print(output)

    record = {
        "doc_id": 'wefwef',
        "collection_id": 'wefwef',
        "chapter_seq": chapter_seq,
        "chapter_number": chapter_seq,
        field_name: output,
        'type': 'werwer',
        "source_chunk_ids": [c['id'] for c in chunks]
    }

    results.append(record)
    
    from src.core.vector_process_store import generate_point_id

    point_id = generate_point_id()

    if results:
        vs.set_collection(write_collection) # 改寫輸出位置
        vs.store_chunk(point_id=point_id,
                       chunk=output, # 這塊會被轉成向量
                       metadata=record)