"""
load_entity_dataset and load_relation_dataset functions to load entity and relation datasets from JSON files.
These functions parse the JSON structure and convert it into pandas DataFrames for easier manipulation and analysis.
"""
import json
import pandas as pd

def load_entity_dataset(
    path: str
) -> tuple[pd.DataFrame, list[dict]]:
    """
    Load entity dataset from JSON file and convert to DataFrame.
    
    Parameters:
    -----------
    path : str
        Path to the entity dataset JSON file
    """
    with open(path) as f:
        kg_entity_set = json.load(f)

    records = []
    for doc in kg_entity_set:
        # Assuming each document has a unique chunk_id
        chunk_id = doc["chunk_id"]
        for ent in doc["entities"]:
            records.append({
                "chunk_id": chunk_id,
                "entity_type": ent.get("type"),
                "entity_name": ent.get("name"),
                "entity_attributes": ent.get("attributes")
            })
    
    entity_df = pd.DataFrame(records)
    return entity_df, kg_entity_set

def load_relation_dataset(
    path: str
) -> tuple[pd.DataFrame, list[dict]]:
    """
    Load relation dataset from JSON file and convert to DataFrame.
    
    Parameters:
    -----------
    path : str
        Path to the relation dataset JSON file
    """
    with open(path) as f:
        kg_relation_set = json.load(f)

    records = []
    for doc in kg_relation_set:
        chunk_id = doc["chunk_id"]
        for rel in doc["relation_set"]:
            records.append({
                "chunk_id": chunk_id,
                "head": rel.get("head"),
                "relation": rel.get("relation"),
                "tail": rel.get("tail")
            })

    relation_df = pd.DataFrame(records)
    return relation_df, kg_relation_set
