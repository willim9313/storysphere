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
            system_prompt=(
                "You are a professional text processing assistant,"
                "skilled in understanding and analyzing text content." 
                "Please carefully read the user's requirements and provide accurate, helpful responses."
            ),
            task_instruction=(
                "Please generate a concise and clear summary for the following text,"
                " retaining the most important information and core content"
            ),
            constraints=(
                f"""- Summary length should not exceed {{max_length}} words"""
                "- Retain key information, important characters, and main plot points"
                "- Maintain the original narrative logic and chronological order"
            ),
            output_format=EnglishBaseTemplates.COMMON_OUTPUT_FORMAT.replace(
                '"result": "Your processing result"',
                '"result": "Summary content"'
            ),
            language=Language.ENGLISH
        )
    
    @staticmethod
    def get_keyword_extraction_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=(
                "You are a professional text processing assistant,"
                "skilled in understanding and analyzing text content."
                "Please carefully read the user's requirements and provide accurate,"
                "helpful responses."
            ),
            task_instruction="Extract the most important and representative keywords from the text",
            constraints=(
                f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}"""
                "- Extract {{top_k}} most important keywords"
                "- Prioritize representative nouns and important concepts"
                "- Sort keywords by importance"
                "- Avoid overly generic terms"""
            ),
            output_format=(
                "Please output in JSON format:\n"
                "{{\n"
                '    "result": [{{"keyword1": "importance_score1"}}, {{"keyword2": "importance_score2"}}, {{"keyword3": "importance_score3"}}]\n'
                "}}"
            ),
            language=Language.ENGLISH
        )
    
    @staticmethod
    def get_entity_extraction_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=(
                "You are a professional text processing assistant,"
                "skilled in understanding and analyzing text content."
                "Please carefully read the user's requirements and provide accurate,"
                "helpful responses."
            ),
            task_instruction="Extract structured entities from the text",
            constraints=(
                f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}"""
                "- Extract meaningful entities and relations from the text"
                "- Do not make up entities and relations that do not exist in the text"
                "- Return JSON with keys: entities[], relations[]"
            ),
            output_format=(
                "Please output in JSON format:\n"
                "{{\n"
                '  \"entities\": [\n'
                "    {{\n"
                '      \"type\": \"Person\",\n'
                '      \"name\": \"Character Name\",\n'
                '      \"attributes\": {{\n'
                '        \"gender\": \"Male\",\n'
                '        \"role\": \"Protagonist\",\n'
                '        \"description\": \"The boy who lived\"\n'
                "      }}\n"
                "    }},\n"
                "    {{\n"
                '      \"type\": \"Object\",\n'
                '      \"name\": \"Object Name\"\n'
                "    }}\n"
                "  ],\n"
                '  \"relations\": [\n'
                "    {{\n"
                '      \"head\": \"Character Name\",\n'
                '      \"relation\": \"possesses\",\n'
                '      \"tail\": \"Object Name\"\n'
                "    }}\n"
                "  ]\n"
                "}}"
            ),
            language=Language.ENGLISH
        )
    
    @staticmethod
    # 具體用戶輸入要怎麼個模樣還要再確認一次
    def get_character_evidence_pack_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=(
                "You are a novel narrative analysis assistant."
                "Your goal is to consolidate original text excerpts related to a specific character into a Character Evidence Package (CEP)."
                "Use only the provided original text; do not request additional information;"
                "do not fabricate content."
                'Prioritize retaining sentences that support a "behavior → motive / consequence" link;'
                'whenever possible, keep both "verb + object" intact.'
                'Each quotation should be ≤ 20 words and annotated with its chunk_id.'
            ),
            task_instruction=(
                "From [CONTEXT], extract only the signals directly related to {{CHAR_NAME}} that can support archetype judgment:"
                "actions (must have the character as the subject, or be a clearly identified agent)"
                "traits (with the speaker’s perspective included)"
                "relations (subject–relation–object format)"
                "key_events (event → cause-effect)"
                "representative_quotes (≤ 5, each must include chunk_id)"
                "top_terms (verbs / adjectives / co-mentioned characters)"
                "Produce a summary within 120 characters (covering what the character wants, how they act, and what consequences result)."
                "Fill in coverage_quality (counts and gaps)."
                "If evidence is insufficient, record the gaps truthfully, but do not request more information."
            ),
            constraints=(
                f"""{EnglishBaseTemplates.COMMON_CONSTRAINTS}"""
                "- Extract evidence related to the specified character"
                "- Provide detailed descriptions and context for each piece of evidence"
                "- Return results in a structured format"
            ),
            output_format=(
                "Output as a single JSON object with keys and field meanings identical to the previous CEP example."
            ),
            language=Language.ENGLISH
        )

    @staticmethod
    def get_archetype_classification_template() -> BaseTemplate:
        return BaseTemplate(
            pass
        )