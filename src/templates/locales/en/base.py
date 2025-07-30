"""
英文基礎模板
"""
from ...base_templates import BaseTemplate, Language

class EnglishBaseTemplates:
    """English base templates"""

    GENERAL_SYSTEM_PROMPT = (
        "You are a professional text analysis maestro," 
        "skilled in understanding and analyzing text content."
        "Please carefully read the user's requirements and provide accurate,"
        "helpful responses."
    )

    COMMON_EXAMPLES_INTRO = "Example:"
    
    
    COMMON_CONSTRAINTS = (
        "Please ensure your responses adhere to the following constraints:\n"
        "- Maintain the semantic and logical structure of the original text.\n"
        "- Ensure the output format is correct and complete.\n"
        "- Provide responses in English."
    )

    COMMON_OUTPUT_FORMAT = """Please output the result in JSON format:
{{
    "result": "Your processing result"
}}
"""
