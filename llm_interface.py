import requests
import json
from typing import Dict, List, Optional
import os
from dotenv import load_dotenv
import streamlit as st

load_dotenv()

class OllamaInterface:
    def __init__(self):
        """Initialize the Ollama interface."""
        self.base_url = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.model = os.getenv("MODEL_NAME", "llama2")

    @st.cache_data
    def generate(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """
        Generate text using the Ollama API.
        
        Args:
            prompt: The user prompt
            system_prompt: Optional system prompt to guide the model's behavior
            
        Returns:
            Generated text response
        """
        url = f"{self.base_url}/api/generate"
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False
        }
        
        if system_prompt:
            payload["system"] = system_prompt
        
        try:
            response = requests.post(url, json=payload)
            response.raise_for_status()
            return response.json()["response"]
        except requests.exceptions.RequestException as e:
            print(f"Error calling Ollama API: {e}")
            return ""

    @st.cache_data
    def analyze_text(self, text: str, task: str) -> str:
        """
        Analyze text for a specific task using the LLM.
        
        Args:
            text: The text to analyze
            task: Description of the analysis task
            
        Returns:
            Analysis result
        """
        system_prompt = f"""You are a novel analysis assistant. Your task is to {task}.
        Provide your analysis in a clear and concise format."""
        
        prompt = f"Here is the text to analyze:\n\n{text}\n\nPlease provide your analysis."
        
        return self.generate(prompt, system_prompt)

    @st.cache_data
    def extract_characters(self, text: str) -> List[Dict]:
        """
        Extract character information from text.
        
        Returns:
            List of character dictionaries with name, description, and relationships
        """
        system_prompt = """You are a character analysis expert. Your task is to extract character information and output it in a specific JSON format.
        Be thorough in identifying all major and supporting characters. Include detailed descriptions and all relationships mentioned in the text."""
        
        prompt = f"""Analyze the following text and extract all character information:

{text}

Return a JSON array of character objects. Each object MUST follow this EXACT format:
{{
    "name": "Character's full name",
    "description": "Detailed physical and personality description",
    "traits": ["trait1", "trait2", "trait3"],
    "relationships": [
        {{
            "related_to": "Name of related character",
            "relationship": "Description of their relationship"
        }}
    ]
}}

Important rules:
1. Include ALL major characters
2. Make sure ALL character names match EXACTLY when referenced in relationships
3. Include relationships in BOTH directions (if A knows B, B should also know A)
4. Keep relationship descriptions concise but informative
5. Ensure the output is valid JSON with proper escaping of quotes

Begin your response with '[' and end with ']'"""
        
        print("\nSending character extraction prompt to LLM...")
        response = self.generate(prompt, system_prompt)
        print(f"\nLLM Response for characters:\n{response}")
        
        try:
            # Clean up the response to ensure it's valid JSON
            json_str = response.strip()
            # Find the first '[' and last ']' to extract the JSON array
            start = json_str.find('[')
            end = json_str.rfind(']') + 1
            if start != -1 and end != 0:
                json_str = json_str[start:end]
            else:
                print("No JSON array found in response, attempting to fix format...")
                # Try to extract a JSON object if array is not found
                start = json_str.find('{')
                end = json_str.rfind('}') + 1
                if start != -1 and end != 0:
                    json_str = f"[{json_str[start:end]}]"
                else:
                    raise json.JSONDecodeError("No valid JSON found", json_str, 0)
            
            print(f"\nCleaned JSON string:\n{json_str}")
            result = json.loads(json_str)
            print(f"\nSuccessfully parsed {len(result)} characters")
            return result
        except json.JSONDecodeError as e:
            print(f"\nError parsing character information: {e}")
            print(f"Problematic JSON string:\n{json_str}")
            return []

    @st.cache_data
    def extract_themes(self, text: str) -> List[Dict]:
        """
        Extract themes and their examples from the text.
        
        Returns:
            List of theme dictionaries with name, description, and examples
        """
        system_prompt = """You are a literary analysis expert. Your task is to identify major themes and provide specific examples from the text.
        Focus on recurring motifs, symbolism, and underlying messages. Format the output as a specific JSON structure."""
        
        prompt = f"""Analyze the following text and identify all major themes:

{text}

Return a JSON array of theme objects. Each object MUST follow this EXACT format:
{{
    "name": "Theme name",
    "description": "Detailed explanation of the theme",
    "examples": [
        "Specific quote or scene that illustrates this theme",
        "Another specific example from the text"
    ]
}}

Important rules:
1. Include at least 3-5 major themes
2. Provide at least 2-3 specific examples for each theme
3. Make sure examples are direct references to the text
4. Keep descriptions clear and concise
5. Ensure the output is valid JSON with proper escaping of quotes

Begin your response with '[' and end with ']'"""
        
        print("\nSending theme extraction prompt to LLM...")
        response = self.generate(prompt, system_prompt)
        print(f"\nLLM Response for themes:\n{response}")
        
        try:
            # Clean up the response to ensure it's valid JSON
            json_str = response.strip()
            start = json_str.find('[')
            end = json_str.rfind(']') + 1
            if start != -1 and end != 0:
                json_str = json_str[start:end]
            else:
                print("No JSON array found in response, attempting to fix format...")
                start = json_str.find('{')
                end = json_str.rfind('}') + 1
                if start != -1 and end != 0:
                    json_str = f"[{json_str[start:end]}]"
                else:
                    raise json.JSONDecodeError("No valid JSON found", json_str, 0)
            
            print(f"\nCleaned JSON string:\n{json_str}")
            result = json.loads(json_str)
            print(f"\nSuccessfully parsed {len(result)} themes")
            return result
        except json.JSONDecodeError as e:
            print(f"\nError parsing theme information: {e}")
            print(f"Problematic JSON string:\n{json_str}")
            return []

    @st.cache_data
    def analyze_writing_style(self, text: str) -> Dict:
        """
        Analyze the writing style of the text.
        
        Returns:
            Dictionary containing style analysis
        """
        system_prompt = """You are an expert literary critic specializing in writing style analysis.
        Your task is to analyze the text's writing style, focusing on tone, voice, pacing, imagery, and literary devices.
        You must format your response as a specific JSON structure."""
        
        prompt = f"""Analyze the writing style of the following text:

{text}

Return a JSON object that EXACTLY follows this format:
{{
    "tone": "Detailed description of the overall emotional tone and mood",
    "voice": "Analysis of the narrative voice, perspective, and storytelling approach",
    "pacing": "Description of how the story's rhythm and timing are handled",
    "imagery": [
        "Specific example of vivid imagery from the text",
        "Another example of descriptive language"
    ],
    "literary_devices": [
        {{
            "device": "Name of literary device (e.g., metaphor, symbolism)",
            "example": "Specific quote or passage demonstrating this device",
            "analysis": "Brief explanation of how this device is used effectively"
        }}
    ]
}}

Important rules:
1. Include at least 3-4 examples of imagery
2. Identify at least 3-4 different literary devices
3. Use specific quotes from the text
4. Keep descriptions clear and analytical
5. Ensure proper JSON formatting with escaped quotes
6. Begin the response with '{{' and end with '}}'

Focus on elements like:
- Emotional tone and atmosphere
- Narrative perspective and voice
- Pacing and rhythm
- Use of descriptive language
- Literary techniques and their effects"""

        print("\nSending writing style analysis prompt to LLM...")
        response = self.generate(prompt, system_prompt)
        print(f"\nLLM Response for writing style:\n{response}")
        
        try:
            # Clean up the response to ensure it's valid JSON
            json_str = response.strip()
            
            # Find the first '{' and last '}' to extract the JSON object
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            
            if start != -1 and end != 0:
                json_str = json_str[start:end]
            else:
                raise json.JSONDecodeError("No valid JSON object found", json_str, 0)
            
            print(f"\nCleaned JSON string:\n{json_str}")
            
            # Try to parse the JSON
            try:
                result = json.loads(json_str)
            except json.JSONDecodeError:
                # If parsing fails, try to fix common JSON formatting issues
                json_str = json_str.replace('\n', ' ').replace('\r', '')
                json_str = json_str.replace('""', '"')
                json_str = json_str.replace('}"', '}')
                json_str = json_str.replace('"{', '{')
                result = json.loads(json_str)
            
            # Validate required fields
            required_fields = ['tone', 'voice', 'pacing', 'imagery', 'literary_devices']
            missing_fields = [field for field in required_fields if field not in result]
            
            if missing_fields:
                print(f"\nWarning: Missing required fields: {missing_fields}")
                # Add empty defaults for missing fields
                for field in missing_fields:
                    if field in ['imagery', 'literary_devices']:
                        result[field] = []
                    else:
                        result[field] = "Not available"
            
            print("\nSuccessfully parsed writing style analysis")
            return result
            
        except json.JSONDecodeError as e:
            print(f"\nError parsing writing style analysis: {e}")
            print(f"Problematic JSON string:\n{json_str}")
            # Return a structured error response instead of empty dict
            return {
                "tone": "Error analyzing tone",
                "voice": "Error analyzing voice",
                "pacing": "Error analyzing pacing",
                "imagery": ["Error extracting imagery examples"],
                "literary_devices": [
                    {
                        "device": "Error",
                        "example": "Could not analyze literary devices",
                        "analysis": "Please try again"
                    }
                ]
            }

    @st.cache_data
    def summarize_text(self, text: str, max_length: Optional[int] = None) -> str:
        """
        Generate a summary of the given text.
        
        Args:
            text: Text to summarize
            max_length: Optional maximum length for the summary
            
        Returns:
            Generated summary
        """
        length_instruction = f" in approximately {max_length} words" if max_length else ""
        system_prompt = f"""You are a summarization expert. Provide a clear and concise summary 
        of the text{length_instruction}. Focus on the main plot points and key events."""
        
        prompt = f"Please summarize this text:\n\n{text}"
        
        print("Sending summarization prompt to LLM...")
        response = self.generate(prompt, system_prompt)
        print(f"LLM Response:\n{response}")
        return response
