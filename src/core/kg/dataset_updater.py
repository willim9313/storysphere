"""
dataset_updater.py
This module provides functions to update knowledge graph datasets with canonical entity names and relations.
It includes functions to update entity and relation DataFrames with canonical names,
and to save updated datasets in JSON format.
"""
import pandas as pd
import copy
import json

def update_entity_df_with_canonical(
    entity_df, 
    canonical_map
) -> pd.DataFrame:
    """
    Update the entity DataFrame with canonical entity names.
    
    Returns:
    --------
    pandas.DataFrame
        Updated entity DataFrame with canonical names
    """
    entity_df['canonical_entity'] = entity_df['entity_name'].map(canonical_map)
    return entity_df

def update_relation_df_with_canonical(
    relation_df,
    canonical_map
) -> pd.DataFrame:
    """
    Update the relation DataFrame with canonical entity names.
    
    Returns:
    --------
    pandas.DataFrame
        Updated relation DataFrame with canonical names
    """
    relation_df['canonical_head'] = relation_df['head'].map(canonical_map)
    relation_df['canonical_tail'] = relation_df['tail'].map(canonical_map)
    return relation_df

def save_updated_entity_json(
    kg_entity_set: list[dict], 
    canonical_map: dict, 
    output_path: str
) -> None:
    """
    Save the updated entity dataset with canonical names back to JSON.
    
    Parameters:
    -----------
    output_path : str
        Path to save the updated entity dataset
    """
    # Create a deep copy of the original entity set
    updated_entity_set = copy.deepcopy(kg_entity_set)

    # Update each entity with its canonical form
    for item in updated_entity_set:
        if isinstance(item.get('entity_set'), dict):
            for etype, entities in item['entity_set'].items():
                if isinstance(entities, list):
                    # Add canonical forms to each entity
                    canonical_entities = []
                    for entity in entities:
                        if entity: # Skip None or empty strings
                            canonical = canonical_map.get(entity, entity)
                            canonical_entities.append({
                                'original': entity,
                                'canonical': canonical
                            })
                    item['canonical_entity_set'] = {etype: canonical_entities}
    
    with open(output_path, 'w') as f:
        json.dump(updated_entity_set, f, indent=2)
    

def save_updated_relation_json(
    kg_relation_set: list[dict], 
    canonical_map: dict, 
    output_path: str
) -> None:
    """
    Save the updated relation dataset with canonical names back to JSON.

    Parameters:
    -----------
    output_path : str
        Path to save the updated relation dataset
    """
    # Create a deep copy of the original relation set
    updated_relation_set = copy.deepcopy(kg_relation_set)

    # Update each relation with canonical forms for head and tail
    for item in updated_relation_set:
        if isinstance(item.get('relation_set'), list):
            canonical_relations = []
            for rel in item['relation_set']:
                if isinstance(rel, dict) and 'head' in rel and 'relation' in rel and 'tail' in rel:
                    canonical_head = canonical_map.get(rel['head'], rel['head'])
                    
                    # Handle tail as either a string or a list
                    if isinstance(rel['tail'], list):
                        canonical_tail = [canonical_map.get(t, t) for t in rel['tail'] if t]
                    else:
                        canonical_tail = canonical_map.get(rel['tail'], rel['tail'])
                    
                    # Create new relation with canonical forms
                    canonical_rel = {
                        'original_head': rel['head'],
                        'canonical_head': canonical_head,
                        'relation': rel['relation'],
                        'original_tail': rel['tail'],
                        'canonical_tail': canonical_tail
                    }
                    canonical_relations.append(canonical_rel)
            item['canonical_relation_set'] = canonical_relations
    with open(output_path, 'w') as f:
        json.dump(updated_relation_set, f, indent=2)
