'''test json extraction'''
from src.core.utils.output_extractor import extract_json_from_text

test_cases = {
    "clean_dict": """
    {
      "respond": "This is a clean JSON object"
    }
    """,

    "clean_list": """
    {
      "respond": ["Napoleon", "Animal Farm", "Squealer"]
    }
    """,

    "with_prefix_suffix": """
    The following is your requested output:

    {
      "respond": ["Boxer", "Clover", "Benjamin"]
    }

    Hope this helps!
    """,

    "nested_structure": """
    {
      "entities": [
        {"type": "Person", "name": "Napoleon"},
        {"type": "Animal", "name": "Boxer"}
      ],
      "relations": [
        {"head": "Napoleon", "relation": "rules", "tail": "Animal Farm"}
      ]
    }
    """,

    "broken_json": """
    {
      "respond": ["Napoleon", "Snowball",
    }
    """,

    "no_json": """
    Sorry, I cannot find anything relevant in the text.
    """,

    "markdown_codeblock": """
    ```json
    {
      "respond": ["Napoleon", "Animal Farm", "Squealer"]
    }
    ```
    """,

    "most_complex_codeblock": """
    {
      "character": {
        "canonical_name": "Boxer",
        "aliases": [],
        "work_title": "Animal Farm",
        "doc_id": "string",
        "notes": "A hardworking horse"
      },
      "source_scope": {
        "collection": "Animal Farm",
        "chunk_count": 9,
        "chapters_covered": [
          "Ch.1"
        ],
        "time_span": "Beginning",
        "retrieval_policy": "all chunks filtered by aliases; plus ±1 neighboring chunks"
      },
      "evidence": {
        "actions": [
          {
            "claim": "Works hard and is respected.",
            "quotes": [
              {
                "text": "…tremendous powers of work.",
                "chunk_id": "chunk-2"
              }
            ],
            "who_says": "narrator",
            "chapter": "Ch.1"
          },
          {
            "claim": "Enters the barn carefully",
            "quotes": [
              {
                "text": "…setting down their vast hairy hoofs with great care…",
                "chunk_id": "chunk-6"
              }
            ],
            "who_says": "narrator",
            "chapter": "Ch.1"
          },
          {
            "claim": "Allows the cat to rest near him.",
            "quotes": [
              {
                "text": "…squeezed herself in between Boxer and Clover…",
                "chunk_id": "chunk-4"
              }
            ],
            "who_says": "narrator",
            "chapter": "Ch.1"
          }
        ],
        "traits": [
          {
            "trait": "strong",
            "polarity": 1,
            "quotes": [
              {
                "text": "…as strong as any two ordinary horses…",
                "chunk_id": "chunk-2"
              }
            ],
            "who_says": "narrator"
          },
          {
            "trait": "respected",
            "polarity": 1,
            "quotes": [
              {
                "text": "…universally respected for his steadiness of character…",
                "chunk_id": "chunk-2"
              }
            ],
            "who_says": "narrator"
          },
          {
            "trait": "not intelligent",
            "polarity": -1,
            "quotes": [
              {
                "text": "…not of first-rate intelligence…",
                "chunk_id": "chunk-2"
              }
            ],
            "who_says": "narrator"
          }
        ],
        "relations": [
          {
            "subject": "Boxer",
            "relation": "devoted_to",
            "object": "Benjamin",
            "quotes": [
              {
                "text": "…he was devoted to Boxer…",
                "chunk_id": "chunk-1"
              }
            ]
          },
          {
            "subject": "Cat",
            "relation": "rests_near",
            "object": "Boxer",
            "quotes": [
              {
                "text": "…squeezed herself in between Boxer…",
                "chunk_id": "chunk-4"
              }
            ]
          }
        ],
        "key_events": [],
        "top_terms": {
          "verbs": [
            "respected",
            "setting",
            "spent"
          ],
          "adjectives": [
            "enormous",
            "stupid",
            "respected",
            "strong"
          ],
          "co_mentioned_characters": [
            "Clover",
            "Benjamin",
            "Muriel",
            "Mollie"
          ]
        },
        "representative_quotes": [
          {
            "text": "…as strong as any two ordinary horses…",
            "chunk_id": "chunk-2"
          },
          {
            "text": "…universally respected for his steadiness of character…",
            "chunk_id": "chunk-2"
          },
          {
            "text": "…he was devoted to Boxer…",
            "chunk_id": "chunk-1"
          }
        ]
      },
      "coverage_quality": {
        "action_signals": 3,
        "trait_signals": 3,
        "relation_signals": 2,
        "quote_count": 3,
        "gaps": [
          "limited motive evidence",
          "no key events"
        ]
      },
      "summary_120w": "Boxer, a strong but unintelligent horse, is respected for his hard work. He is devoted to Benjamin and allows the cat to rest near him.  "
    }
    """
}

for name, case in test_cases.items():
    print(f"\n=== {name} ===")
    result = extract_json_from_text(case)
    print(result)

# import ast

# tmp = ''' ```json {"character": {"canonical_name": "Major", "aliases": ["old Major", "Willingdon Beauty"], "work_title": "Animal Farm", "doc_id": "string", "notes": "Prize Middle White boar"}, "source_scope": {"collection": "Animal Farm", "chunk_count": 10, "chapters_covered": ["Ch.1"], "time_span": "Beginning", "retrieval_policy": "all chunks filtered by aliases; plus ±1 neighboring chunks"}, "evidence": {"actions": [{"claim": "Shares dream and wisdom with other animals.", "quotes": [{"text": "wished to communicate it to the other animals.", "chunk_id": "uuid-12"}, {"text": "pass on to you such wisdom as I have acquired.", "chunk_id": "uuid-3"}], "who_says": "narrator", "chapter": "Ch.1"}, {"claim": "Asks if rats are comrades.", "quotes": [{"text": "Are rats comrades?", "chunk_id": "uuid-7"}], "who_says": "Major", "chapter": "Ch.1"}, {"claim": "Tells animals to remember their duty of enmity towards Man.", "quotes": [{"text": "remember always your duty of enmity towards Man.", "chunk_id": "uuid-8"}], "who_says": "Major", "chapter": "Ch.1"}], "traits": [{"trait": "wise", "polarity": 1, "quotes": [{"text": "wise and benevolent appearance", "chunk_id": "uuid-13"}], "who_says": "narrator"}, {"trait": "majestic", "polarity": 1, "quotes": [{"text": "still a majestic-looking pig", "chunk_id": "uuid-13"}], "who_says": "narrator"}, {"trait": "highly regarded", "polarity": 1, "quotes": [{"text": "so highly regarded on the farm", "chunk_id": "uuid-12"}], "who_says": "narrator"}], "relations": [{"subject": "Major", "relation": "mentor_of", "object": "animals", "quotes": [{"text": "pass on to you such wisdom", "chunk_id": "uuid-3"}]}, {"subject": "Animals", "relation": "respect", "object": "Major", "quotes": [{"text": "so highly regarded on the farm", "chunk_id": "uuid-12"}]}], "key_events": [{"event": "Major inspires animals.", "cause": "Dream", "effect": "animals meet", "chapter": "Ch.1", "quotes": [{"text": "had a strange dream...wished to communicate it", "chunk_id": "uuid-12"}]}], "top_terms": {"verbs": ["say", "speak", "remember", "tell"], "adjectives": ["old", "wise", "majestic", "benevolent"], "co_mentioned_characters": ["rats", "dogs", "pigs"]}, "representative_quotes": [{"text": "pass on to you such wisdom", "chunk_id": "uuid-3"}, {"text": "Are rats comrades?", "chunk_id": "uuid-7"}, {"text": "duty of enmity towards Man.", "chunk_id": "uuid-8"}, {"text": "wise and benevolent appearance", "chunk_id": "uuid-13"}]}, "coverage_quality": {"action_signals": 3, "trait_signals": 3, "relation_signals": 2, "quote_count": 4, "gaps": ["Later chapters not covered", "Motives sparsely detailed"]}, "summary_120w": "Major, a respected boar, shares his dream of a world without Man and imparts his wisdom, urging animals to see humans as enemies. "}```'''
# print(ast.literal_eval(tmp))

# print(type(ast.literal_eval(tmp)))