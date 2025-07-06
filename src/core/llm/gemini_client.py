'''
https://ai.google.dev/gemini-api/docs/text-generation?hl=zh-tw
'''
from dotenv import load_dotenv
from google import genai
from google.genai import types
import os

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")


class GeminiClient:
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def set_model(self, model_name: str):
        self.model = model_name

    def get_model(self):
        return self.model

    def generate_response(self, prompt: str, instruction: str = None) -> str:
        client = genai.Client(api_key=self.api_key)
        if instruction:
            response = client.models.generate_content(
                model=self.model,
                config=types.GenerateContentConfig(
                    system_instruction=instruction),
                contents=prompt
            )
            return response.text
        else:
            response = client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            return response.text


if __name__ == "__main__":
    # Test the Gemini client
    print("You are using Gemini client.")
    client = GeminiClient(API_KEY, MODEL_NAME)
    print(f"Default Model: {client.model}")
    print(f"API Key: {client.api_key}")

    print("Test instruction chat")
    print(client.generate_response(instruction="Talk like a pirate.", 
                                   prompt="Are semicolons optional in JavaScript?"))
    
    print("Test normal chat")
    print(client.generate_response(prompt="Are semicolons optional in JavaScript?"))
