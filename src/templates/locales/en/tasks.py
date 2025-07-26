from ...base_templates import BaseTemplate, Language
from .base import EnglishBaseTemplates

class EnglishTaskTemplates:
    """English task templates"""
    
    @staticmethod
    def get_summarization_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=EnglishBaseTemplates.GENERAL_SYSTEM_PROMPT,
            task_instruction="Please generate a concise and clear summary for the following text, retaining the most important information and core content",
            input_format="Original text content to be summarized",
            output_format=EnglishBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "Your processing result"',
                '"result": "Summary content"'
            ),
            constraints=f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}
- Summary length should not exceed {{max_length}} words
- Retain key information, important characters, and main plot points
- Maintain the original narrative logic and chronological order""",
            examples=f"""
{EnglishBaseTemplates.COMMON_EXAMPLES_INTRO}
Input: "John went for a walk in the park today and unexpectedly met his old friend Mike, whom he hadn't seen for years. They sat on a bench and chatted for a long time, reminiscing about their school days, both feeling very happy and nostalgic."
Output: {{"result": "John met old friend Mike in park, both happily reminisced about school days", "confidence": 0.95}}
""",
            language=Language.ENGLISH
        )
    
    @staticmethod
    def get_keyword_extraction_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=EnglishBaseTemplates.GENERAL_SYSTEM_PROMPT,
            task_instruction="Extract the most important and representative keywords from the text",
            input_format="Original text content for keyword extraction",
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
            constraints=f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}
- Extract {{top_k}} most important keywords
- Prioritize representative nouns and important concepts
- Sort keywords by importance
- Avoid overly generic terms""",
            examples="",
            language=Language.ENGLISH
        )