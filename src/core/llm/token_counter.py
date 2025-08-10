"""
Universal token counter for different LLM providers
"""
import tiktoken
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod

class BaseTokenCounter(ABC):
    """Base class for token counters"""
    
    @abstractmethod
    def count_tokens(self, text: str, instruction: str = None) -> int:
        pass

class TikTokenCounter(BaseTokenCounter):
    """OpenAI-compatible token counter using tiktoken"""
    
    def __init__(self, encoding_name: str = "cl100k_base"):
        try:
            self.tokenizer = tiktoken.get_encoding(encoding_name)
        except Exception:
            # Fallback to simple estimation
            self.tokenizer = None
    
    def count_tokens(
        self, 
        text: str, 
        instruction: str = None
    ) -> int:
        combined_text = f"{instruction}\n{text}" if instruction else text
        
        if self.tokenizer:
            return len(self.tokenizer.encode(combined_text))
        else:
            # Simple estimation: ~4 characters per token
            return len(combined_text) // 4

class GeminiTokenCounter(BaseTokenCounter):
    """Gemini-specific token counter"""
    
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        # Also keep a local estimator as fallback
        self.fallback_counter = TikTokenCounter()
    
    def count_tokens(
        self, 
        text: str, 
        instruction: str = None
    ) -> int:
        # Use local estimation to avoid API costs
        return self.fallback_counter.count_tokens(text, instruction)
    
    def count_tokens_precise(
        self, 
        text: str, 
        instruction: str = None
    ) -> int:
        """Precise token counting using Gemini API (billable)"""
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            combined_text = f"{instruction}\n{text}" if instruction else text
            
            response = client.models.count_tokens(
                model=self.model,
                contents=combined_text
            )
            return response.total_tokens
        except Exception:
            # Fallback to local estimation
            return self.fallback_counter.count_tokens(text, instruction)

class OllamaTokenCounter(BaseTokenCounter):
    """Ollama token counter (uses estimation)"""
    
    def __init__(self):
        self.fallback_counter = TikTokenCounter()
    
    def count_tokens(self, text: str, instruction: str = None) -> int:
        # Ollama doesn't have a direct token counting API
        # Use tiktoken estimation
        return self.fallback_counter.count_tokens(text, instruction)

class TokenCounterFactory:
    """Factory to create appropriate token counter based on provider"""
    
    @staticmethod
    def create_counter(provider: str, **kwargs) -> BaseTokenCounter:
        if provider.lower() == "openai":
            encoding = kwargs.get("encoding", "cl100k_base")
            return TikTokenCounter(encoding)
        
        elif provider.lower() == "gemini":
            api_key = kwargs.get("api_key")
            model = kwargs.get("model")
            if not api_key or not model:
                raise ValueError("Gemini counter requires api_key and model")
            return GeminiTokenCounter(api_key, model)
        
        elif provider.lower() == "ollama":
            return OllamaTokenCounter()
        
        else:
            # Default to tiktoken
            return TikTokenCounter()

# Utility functions for easy usage
# 以下沒有特別研究過
def count_tokens(
    text: str, 
    provider: str, 
    instruction: str = None, 
    **kwargs
) -> int:
    """Convenient function to count tokens for any provider"""
    counter = TokenCounterFactory.create_counter(provider, **kwargs)
    return counter.count_tokens(text, instruction)

# 這算是動態生成的，後續應該暫時用不到
def estimate_cost(
    tokens: int, 
    provider: str, 
    model: str = None
) -> Dict[str, Any]:
    """Estimate cost based on token count (you can expand this)"""
    # This is a simplified example - you'd want to maintain actual pricing
    pricing = {
        "openai": {
            "gpt-4": {"input": 0.03, "output": 0.06},  # per 1K tokens
            "gpt-3.5-turbo": {"input": 0.0015, "output": 0.002}
        },
        "gemini": {
            "gemini-pro": {"input": 0.00025, "output": 0.0005}
        }
    }
    
    if provider in pricing and model in pricing[provider]:
        input_cost = (tokens / 1000) * pricing[provider][model]["input"]
        return {
            "estimated_input_cost": input_cost,
            "currency": "USD",
            "tokens": tokens
        }
    
    return {"error": "Pricing not available", "tokens": tokens}