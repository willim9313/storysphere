"""
English task templates
"""
from ...base_templates import BaseTemplate, Language
from .base import EnglishBaseTemplates

class EnglishTaskTemplates:
    """English task templates"""
    @staticmethod
    def get_chatbot_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=EnglishBaseTemplates.GENERAL_SYSTEM_PROMPT,
            task_instruction="Please answer the user's questions",
            constraints=EnglishBaseTemplates.COMMON_CONSTRAINTS,
            output_format=EnglishBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "Your processing result"',
                '"result": "Your answer to the user\'s question"'
            ),
            language=Language.ENGLISH
        )

    @staticmethod
    def get_summarization_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt="You are a professional text processing assistant, skilled in understanding and analyzing text content. Please carefully read the user's requirements and provide accurate, helpful responses.",
            task_instruction="Please generate a concise and clear summary for the following text, retaining the most important information and core content",
            constraints=f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}
- Summary length should not exceed {{max_length}} words
- Retain key information, important characters, and main plot points
- Maintain the original narrative logic and chronological order""",
            output_format=EnglishBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "Your processing result"',
                '"result": "Summary content"'
            ),
            language=Language.ENGLISH
        )
    
    @staticmethod
    def get_keyword_extraction_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt="You are a professional text processing assistant, skilled in understanding and analyzing text content. Please carefully read the user's requirements and provide accurate, helpful responses.",
            task_instruction="Extract the most important and representative keywords from the text",
            constraints=f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}
- Extract {{top_k}} most important keywords
- Prioritize representative nouns and important concepts
- Sort keywords by importance
- Avoid overly generic terms""",
            output_format="""
Please output in JSON format:
{{
    "result": ["keyword1", "keyword2", "keyword3"],
    "confidence": "Confidence score (0-1)",
    "metadata": {{
        "total_keywords": "Total number of extracted keywords",
        "categories": {{
            "people": ["people keywords"],
            "places": ["place keywords"],
            "events": ["event keywords"],
            "concepts": ["concept keywords"]
        }}
    }}
}}
""",
            language=Language.ENGLISH
        )
