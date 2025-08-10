# # 主程式中使用的 token 計數器
# # 在調用任何 LLM 之前，先檢查 token 數量
# from src.core.llm.token_counter import count_tokens
# from src.core.llm.gemini_client import GeminiClient

# def smart_llm_call(prompt: str, instruction: str = None):
#     # 先計算 token
#     tokens = count_tokens(prompt, "gemini", instruction=instruction)
    
#     # 檢查是否超過限制
#     if tokens > 1000000:  # Gemini 限制
#         return {"error": "Input too long", "tokens": tokens}
    
#     # 警告高 token 使用
#     if tokens > 500000:
#         print(f"Warning: High token usage ({tokens} tokens)")
    
#     # 實際調用 LLM
#     client = GeminiClient(API_KEY, MODEL_NAME)
#     response = client.generate_response(prompt, instruction)
    
#     # 添加 token 信息到回應中
#     response["estimated_input_tokens"] = tokens
#     return response

# # 批量處理多個文本時使用
# from src.core.llm.token_counter import TokenCounterFactory

# def batch_token_analysis(texts: list, provider: str = "openai"):
#     counter = TokenCounterFactory.create_counter(provider)
    
#     results = []
#     for i, text in enumerate(texts):
#         tokens = counter.count_tokens(text)
#         results.append({
#             "index": i,
#             "text_preview": text[:50] + "..." if len(text) > 50 else text,
#             "tokens": tokens,
#             "estimated_cost": estimate_cost(tokens, provider, "gpt-4")
#         })
    
#     return results

# # 使用示例
# texts = [
#     "Short text",
#     "Much longer text that might use more tokens...",
#     "Another piece of text for analysis"
# ]

# analysis = batch_token_analysis(texts, "openai")
# for result in analysis:
#     print(f"Text {result['index']}: {result['tokens']} tokens, Cost: ${result['estimated_cost'].get('estimated_input_cost', 0):.4f}")



# 測試用
# 獨立使用 token_counter
from src.core.llm.token_counter import (
    count_tokens, TokenCounterFactory, estimate_cost
)

# 方法 1: 使用便利函數
input_text = "Hello world, how are you?"
instruction = "You are a helpful assistant."

# # 不同提供商的 token 計算
# # 注意：特別需要提供api key
# openai_tokens = count_tokens(input_text, "openai", instruction=instruction)
# gemini_tokens = count_tokens(input_text, "gemini", instruction=instruction)
# ollama_tokens = count_tokens(input_text, "ollama", instruction=instruction)

# print(f"OpenAI tokens: {openai_tokens}")
# print(f"Gemini tokens: {gemini_tokens}")
# print(f"Ollama tokens: {ollama_tokens}")

# 方法 2: 使用工廠模式
# counter = TokenCounterFactory.create_counter("openai")
counter = TokenCounterFactory.create_counter("none")
tokens = counter.count_tokens(input_text, instruction)
print(f"Tokens: {tokens}")

# # 成本估算
# cost_info = estimate_cost(tokens, "openai", "gpt-4")
# print(f"Estimated cost: {cost_info}")