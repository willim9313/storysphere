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
    # 用戶輸入的是角色名稱與相關的情節片段
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
                "From [CONTEXT], extract only the signals directly related to {{character_name}} that can support archetype judgment:\n"
                "- actions (must have the character as the subject, or be a clearly identified agent)\n"
                "- traits (with the speaker’s perspective included)\n"
                "- relations (subject–relation–object format)\n"
                "- key_events (event → cause-effect)\n"
                "- representative_quotes (≤ 5, each must include chunk_id)\n"
                "- top_terms (verbs / adjectives / co-mentioned characters)\n"
                "Produce a summary within 120 characters (covering what the character wants, how they act, and what consequences result)."
                "Fill in coverage_quality (counts and gaps)."
                "If evidence is insufficient, record the gaps truthfully, but do not request more information."
            ),
            examples=(
                '{{\n'
                '"character": {{\n'
                '    "canonical_name": "Mr. Jones",\n'
                '    "aliases": ["Jones", "farmer Jones"],\n'
                '    "work_title": "Animal Farm",\n'
                '    "doc_id": "string",\n'
                '    "notes": "any short hints for disambiguation"\n'
                '}},\n'
                '"source_scope": {{\n'
                '    "collection": "Animal Farm",\n'
                '    "chunk_count": 27,\n'
                '    "chapters_covered": ["Ch.1", "Ch.2", "Ch.4"],\n'
                '    "time_span": "early-to-mid story",\n'
                '    "retrieval_policy": "all chunks filtered by aliases; plus ±1 neighboring chunks"\n'
                '}},\n'
                '"evidence": {{\n'
                '    "actions": [\n'
                '        {{\n'
                '            "claim": "Neglects farm duties due to heavy drinking",\n'
                '            "quotes": [\n'
                '                {{"text": "…drank heavily and neglected the farm.", "chunk_id": "uuid-1"}}\n'
                '            ],\n'
                '            "who_says": "narrator",\n'
                '            "chapter": "Ch.1"\n'
                '        }},\n'
                '        {{\n'
                '            "claim": "Loses control of the farm after an uprising",\n'
                '            "quotes": [\n'
                '                {{"text": "…the animals chased Jones off the farm.", "chunk_id": "uuid-7"}}\n'
                '            ],\n'
                '            "who_says": "narrator",\n'
                '            "chapter": "Ch.2"\n'
                '        }}\n'
                '    ],\n'
                '    "traits": [\n'
                '        {{\n'
                '            "trait": "negligent",\n'
                '            "polarity": -1,\n'
                '            "quotes": [{{"text": "…careless owner…", "chunk_id": "uuid-3"}}],\n'
                '            "who_says": "narrator/others"\n'
                '        }},\n'
                '        {{\n'
                '            "trait": "former authority figure",\n'
                '            "polarity": 1,\n'
                '            "quotes": [{{"text": "…the owner of Animal Farm…", "chunk_id": "uuid-2"}}]\n'
                '        }}\n'
                '    ],\n'
                '    "relations": [\n'
                '        {{\n'
                '            "subject": "Mr. Jones",\n'
                '            "relation": "former_owner_of",\n'
                '            "object": "Animal Farm",\n'
                '            "quotes": [{{"text": "…owner of Animal Farm…", "chunk_id": "uuid-2"}}]\n'
                '        }},\n'
                '        {{\n'
                '            "subject": "Animals",\n'
                '            "relation": "rebels_against",\n'
                '            "object": "Mr. Jones",\n'
                '            "quotes": [{{"text": "…drove out Jones…", "chunk_id": "uuid-6"}}]\n'
                '        }}\n'
                '    ],\n'
                '    "key_events": [\n'
                '        {{\n'
                '            "event": "Uprising expels Mr. Jones",\n'
                '            "cause": "Abuse/neglect",\n'
                '            "effect": "Loss of power",\n'
                '            "chapter": "Ch.2",\n'
                '            "quotes": [{{"text": "…chased Jones off…", "chunk_id": "uuid-7"}}]\n'
                '        }}\n'
                '    ],\n'
                '    "top_terms": {{\n'
                '        "verbs": ["drink", "neglect", "lose", "flee"],\n'
                '        "adjectives": ["negligent", "cruel", "former"],\n'
                '        "co_mentioned_characters": ["Napoleon", "Boxer"]\n'
                '    },\n'
                '    "representative_quotes": [\n'
                '        {{"text": "…drank heavily and neglected the farm.", "chunk_id": "uuid-1"}},\n'
                '        {{"text": "…the animals chased Jones off…", "chunk_id": "uuid-7"}}\n'
                '    ]\n'
                '}},\n'
                '"coverage_quality": {{\n'
                '    "action_signals": 5,\n'
                '    "trait_signals": 3,\n'
                '    "relation_signals": 2,\n'
                '    "quote_count": 5,\n'
                '    "gaps": ["few first-person motives", "limited late-story evidence"]\n'
                '}},\n'
                '"summary_120w": "Concise one-paragraph summary capturing want/motive/action/consequence.",\n'
                '"build_meta": {{\n'
                '    "version": "cep-1.0",\n'
                '    "max_items": {{"actions": 6, "traits": 5, "relations": 4, "events": 4, "quotes": 5}},\n'
                '    "token_budget": 700\n'
                '}}\n'
            ),
            constraints=(
                "max_items:\n"
                "  actions: 6\n"
                "  traits: 5\n"
                "  relations: 4\n"
                "  events: 4\n"
                "  quotes: 5\n"
                "- Extract evidence related to the specified character\n"
                "- Provide detailed descriptions and context for each piece of evidence\n"
                "- Return results in a structured format\n"
            ),
            output_format=(
                "Output as a single JSON object with keys and field meanings identical to the previous CEP example."
            ),
            language=Language.ENGLISH
        )

    @staticmethod
    def get_archetype_classification_template() -> BaseTemplate:
        return BaseTemplate(
            system_prompt=(
                "You are a character archetype analyst."
                "Use only the given Character Evidence Pack (CEP); you may not request additional information, "
                "nor may you reference knowledge outside the CEP."
                "When evaluating, prioritize actions and causal events, followed by others' comments/relationships."
                "If the evidence conflicts, you must point out the contradictions and adjust the confidence score accordingly."
            ),
            task_instruction=(
                "Perform category-by-category comparison: align the functional descriptions in [ARCHETYPE_SET] with the behaviors, "
                "events, relations, and comments in the CEP.\n"
                "Export with the following contents:\n"
                "- primary_archetype: {{id, score}}\n"
                "- secondary_archetypes: [{{id, score}}, … up to 2]\n"
                "- rationale: array; each item must include maps_to (archetype ID) + evidence (short phrase) + quote (citation ≤20 characters) + chunk_id\n"
                "- conflicts_or_limits: list contradictions / insufficient evidence\n"
                "- confidence: 0-1"
            ),
            constraints=(
                "You may not request additional information.\n"
                "You must rely only on content from the CEP; each archetype score must include at least one piece of evidence with a chunk_id.\n"
                "If a character has multiple facets, both primary and secondary archetypes are allowed.\n"
                "If a “shadow” aspect is present (e.g., Ruler_Shadow), mark it with the _Shadow suffix, and explicitly cite the corresponding behaviors in the rationale.\n"
            ),
            output_format=(
                '{{\n'
                '   "character": "Mr. Jones",\n'
                '   "primary_archetype": {{"id": "Ruler_Shadow", "score": 0.78}},\n'
                '   "secondary_archetypes": [\n'
                '       {{"id": "Orphan", "score": 0.42}},\n'
                '       {{"id": "Jester_Shadow", "score": 0.31}}\n'
                '   ],\n'
                '   "rationale": [\n'
                '       {{\n'
                '           "maps_to": "Ruler_Shadow",\n'
                '           "evidence": "Abuses authority; neglects duties; loses legitimacy",\n'
                '           "quote": "…drank heavily and neglected the farm.",\n'
                '           "chunk_id": "uuid-1"\n'
                '       }},\n'
                '       {{\n'
                '           "maps_to": "Orphan",\n'
                '           "evidence": "Dispossessed after uprising; loss of security",\n'
                '           "quote": "…animals chased Jones off…",\n'
                '           "chunk_id": "uuid-7"\n'
                '       }}\n'
                '   ],\n'
                '   "conflicts_or_limits": [\n'
                '       "Few first-person motives; most quotes are narrator-side."\n'
                '   ],\n'
                '   "confidence": 0.70\n'
                '}}'

            ),
            language=Language.ENGLISH
        )