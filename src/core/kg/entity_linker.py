"""
entity linker module
This module provides functions to find similar entities based on their embeddings,
canonicalize entity names, and aggregate attributes for canonical entities.
"""
import numpy as np
import pandas as pd
import networkx as nx
from sklearn.metrics.pairwise import cosine_similarity
from collections import defaultdict

def find_similar_entities(
    embedding_dict: dict[str, np.ndarray], 
    threshold: float=0.95
):
    """
    Find similar entities within the dataset using cosine similarity.
    
    Parameters:
    -----------
    threshold : float, default=0.95
        Similarity threshold for considering entities as similar
        
    Returns:
    --------
    dict
        Dictionary mapping each entity to a list of similar entities
    """
    entities = list(embedding_dict.keys())
    embeddings = np.array([embedding_dict[entity] for entity in entities])

    # Compute cosine similarity between entity embeddings
    similarities = cosine_similarity(embeddings)

    # Find similar entities based on the threshold
    similar_entities = {}
    for i, entity in enumerate(entities):
        similar = []
        for j, other_entity in enumerate(entities):
            if i != j and similarities[i, j] >= threshold:
                similar.append((other_entity, similarities[i, j]))
        if similar:
            similar_entities[entity] = sorted(similar, key=lambda x: x[1], reverse=True)
    return similar_entities

def canonicalize_entities(
    entity_df: pd.DataFrame, 
    embedding_dict: dict[str, np.ndarray],
    threshold: float=0.95, 
    strategy: str='longest'
) -> tuple[dict, list]:
    """
    Group similar entities and assign a canonical name to each group.
    
    Parameters:
    -----------
    threshold : float, default=0.95
        Similarity threshold for considering entities as similar
    strategy : str, default='longest'
        Strategy for selecting the canonical name:
        - 'longest': Use the longest entity name
        - 'most_frequent': Use the most frequent entity name
        
    Returns:
    --------
    dict
        Dictionary mapping each original entity to its canonical form
    """
    # Find similar entities
    similar_entities = find_similar_entities(
        embedding_dict, 
        threshold
    )

    # Create a graph where nodes are entities and edges connect similar entities
    G = nx.Graph()
    for entity in embedding_dict:
        G.add_node(entity)

    for entity, similars in similar_entities.items():
        for similar_entity, score in similars:
            G.add_edge(entity, similar_entity, weight=score)
    
    # Find connected components (groups of similar entities)
    connected_components = list(nx.connected_components(G))

    # Assign canonical names
    canonical_map = {}
    for component in connected_components:
        component = list(component)
        if strategy == 'longest':
            # Use the longest entity name as the canonical name
            canonical = max(component, key=len)
        elif strategy == 'most_frequent':
            # Use the most frequent entity name as the canonical name
            counts = entity_df['entity_name'].value_counts()
            canonical = max(component, key=lambda x: counts.get(x, 0))
        else:
            # Default to the first entity
            canonical = component[0]
        # Map each entity in the component to the canonical name
        for entity in component:
            canonical_map[entity] = canonical
    # Add any entities that weren't part of any component (unique entities)
    for entity in embedding_dict:
        if entity not in canonical_map:
            canonical_map[entity] = entity

    return canonical_map, connected_components

def merge_entity_attribute_dicts(
    dicts: list[dict]
) -> dict:
    """
    dicts: List[dict]，每個是 entity_attributes
    """
    merged = {}
    # 先找出所有出現過的 key
    keys = set()
    for d in dicts:
        if isinstance(d, dict):
            keys.update(d.keys())
    # 對每個key收集所有非None、非重複的值
    for k in keys:
        values = [d[k] for d in dicts if isinstance(d, dict) and d.get(k) is not None]
        merged[k] = list(set(values))
    return merged

def aggregate_attributes(
    entity_df: pd.DataFrame, 
    canonical_map: dict[str, str]
) -> dict:
    """
    Aggregate attributes for each canonical entity.
    """
    # 準備一個空的屬性集合，這是處理屬性的部分
    canonical_entity_attributes = defaultdict(lambda: defaultdict(list))
    
    # entity_df應該有 entity_name + 各種attributes
    for _, row in entity_df.iterrows():
        entity = row['entity_name']
        canonical = canonical_map[entity]
        for attr in row.index:
            if attr == 'entity_name':
                continue
            val = row[attr]
            if pd.notnull(val):
                canonical_entity_attributes[canonical][attr].append(val)

    for entity, attr_dict in canonical_entity_attributes.items():
        if 'entity_attributes' in attr_dict:
            merged_attr = merge_entity_attribute_dicts(attr_dict['entity_attributes'])
            attr_dict['entity_attributes'] = merged_attr

    return canonical_entity_attributes
