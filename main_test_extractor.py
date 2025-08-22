'''test json extraction'''
from src.core.utils.extractor import extract_json

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
    """
}

for name, case in test_cases.items():
    print(f"\n=== {name} ===")
    result = extract_json(case)
    print(result)
