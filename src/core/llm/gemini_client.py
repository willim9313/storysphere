'''
https://ai.google.dev/gemini-api/docs/text-generation?hl=zh-tw
'''
from dotenv import load_dotenv
from typing import Optional
import os
import time
from google import genai
from google.genai import types

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")


class GeminiClient:
    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ValueError("API key is required")
        self.api_key = api_key
        self.model = model

    def set_model(self, model_name: str):
        self.model = model_name

    def get_model(self):
        return self.model

    def generate_response(
        self,
        prompt: str,
        instruction: Optional[str] = None,
        max_retries: int = 3
    ) -> Optional[str]:
        """呼叫 Gemini API 產生回應"""
        for attempt in range(max_retries):
            try:
                client = genai.Client(api_key=self.api_key)

                if instruction:
                    response = client.models.generate_content(
                        model=self.model,
                        config=types.GenerateContentConfig(
                            system_instruction=instruction,
                            thinking_config=types.ThinkingConfig(
                                thinking_budget=0
                                ),
                        ),
                        contents=prompt
                    )
                else:
                    response = client.models.generate_content(
                        model=self.model,
                        contents=prompt
                    )

                # 檢查回應
                if not response.text:
                    raise Exception("Empty response from Gemini API")

                return response.text

            except Exception as e:
                print(f"Error on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    raise Exception(f"Gemini API failed after {max_retries} attempts: {str(e)}")
                else:
                    sleep_time = (2 ** attempt) + 1
                    time.sleep(sleep_time)  # 指數退避
