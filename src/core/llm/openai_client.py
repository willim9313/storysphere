'''
https://platform.openai.com/docs/api-reference/introduction
'''
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")
MODEL_NAME = os.getenv("OPENAI_MODEL")

class OpenAIClient:
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def set_model(self, model_name: str):
        self.model = model_name

    def get_model(self):
        return self.model
   
    def generate_response(self, prompt: str, instruction: str = None) -> str:
        client = OpenAI(api_key=self.api_key)
        if instruction:
            response = client.responses.create(
                model=self.model,
                instructions=instruction,
                input=prompt
            )
            return response.output_text
        else:
            response = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content



if __name__ == "__main__":
    # Test the OpenAI client
    print("You are using OpenAI client.")
    client = OpenAIClient(API_KEY, MODEL_NAME)
    print(f"Default Model: {client.model}")
    print(f"API Key: {client.api_key}")

    print("Test instruction chat")
    print(client.generate_response(instruction="Talk like a pirate.", 
                                   prompt="Are semicolons optional in JavaScript?"))
    
    print("Test normal chat")
    print(client.generate_response(prompt="Are semicolons optional in JavaScript?"))



        # completion = client.chat.completions.create(
#   model="gpt-4o-mini",
#   store=True,
#   messages=[
#     {"role": "user", "content": "write a haiku about ai"}
#   ]
# )