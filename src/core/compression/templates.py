class CompressionTemplates:
    GENERAL_TEMPLATE = """
    Compress the following content while preserving essential information:
    
    Content:
    {content}
    
    Requirements:
    - Maintain key facts and relationships
    - Preserve important details
    - Keep it under {max_tokens} tokens
    
    Output JSON:
    {{
        "compressed_content": "...",
        "key_points": [...],
        "entities_mentioned": [...],
        "compression_ratio": 0.x
    }}
    """
    
    TOPIC_TEMPLATE = """
    Compress the following topic-grouped content:
    
    {grouped_content}
    
    For each topic, provide:
    - Main themes and concepts
    - Key relationships
    - Important events or facts
    
    Output JSON:
    {{
        "topics": {{
            "topic_name": {{
                "summary": "...",
                "key_points": [...],
                "entities": [...]
            }}
        }},
        "overall_summary": "...",
        "cross_topic_relationships": [...]
    }}
    """
    
    SEQUENTIAL_TEMPLATE = """
    Compress the following sequential content while maintaining chronological flow:
    
    {sequential_content}
    
    Requirements:
    - Preserve temporal relationships
    - Maintain narrative flow
    - Highlight key developments
    
    Output JSON:
    {{
        "timeline_summary": "...",
        "key_events": [...],
        "character_developments": [...],
        "causal_relationships": [...]
    }}
    """