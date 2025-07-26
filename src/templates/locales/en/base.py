from ...base_templates import BaseTemplate, Language

class EnglishBaseTemplates:
    """English base templates"""
    
    GENERAL_SYSTEM_PROMPT = """You are a professional text processing assistant, skilled in understanding and analyzing text content. Please carefully read the user's requirements and provide accurate, helpful responses."""
    
    COMMON_OUTPUT_FORMAT = """
Please output the result in JSON format:
{{
    "result": "Your processing result",
    "confidence": "Confidence score (0-1)",
    "metadata": {{
        "processing_time": "Processing notes",
        "notes": "Additional notes"
    }}
}}
"""
    
    COMMON_CONSTRAINTS = """
- Maintain the semantic and logical structure of the original text
- Ensure the output format is correct and complete
- If uncertain about content, indicate with a lower confidence score
- Provide responses in English
"""

    COMMON_EXAMPLES_INTRO = "Example:"