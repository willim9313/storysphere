"""
Knowledge Graph Retriever Module
Provides functions to retrieve and filter data from knowledge graph datasets.
前三種方法是採用json檔案直接讀取
再來兩種適用dataframe的方式
倒數第二個是看networkx的graph
最後一個是用關鍵字搜尋 dataframe中的內容
目前會先用dataframe去組，後面再針對此模組做修正
"""
import json
import pandas as pd
import networkx as nx
from typing import Dict, List, Any, Optional, Union
from pathlib import Path

def filter_entities_from_json(
    json_file_path: str,
    entity_type: Optional[str] = None,
    entity_name: Optional[str] = None,
    chunk_id: Optional[str] = None,
    canonical_entity: Optional[str] = None,
    attributes_filter: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Filter entities directly from JSON file.
    
    Parameters:
    -----------
    json_file_path : str
        Path to the JSON file containing entities
    entity_type : str, optional
        Filter by entity type
    entity_name : str, optional
        Filter by entity name (supports partial matching)
    chunk_id : str, optional
        Filter by chunk ID
    canonical_entity : str, optional
        Filter by canonical entity name
    attributes_filter : dict, optional
        Filter by entity attributes
        
    Returns:
    --------
    List[Dict[str, Any]]
        List of filtered entity dictionaries
    """
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Assume entities are in 'entities' key or the data itself is a list
    if isinstance(data, dict) and 'entities' in data:
        entities = data['entities']
    elif isinstance(data, list):
        entities = data
    else:
        entities = [data]  # Single entity
    
    filtered_entities = []
    
    for entity in entities:
        # Apply filters
        if entity_type and entity.get('entity_type') != entity_type:
            continue
            
        if entity_name and entity_name.lower() not in entity.get('entity_name', '').lower():
            continue
            
        if chunk_id and entity.get('chunk_id') != chunk_id:
            continue
            
        if canonical_entity and entity.get('canonical_entity') != canonical_entity:
            continue
            
        # TODO: Implement attributes filtering
        if attributes_filter:
            # This would depend on your attribute structure
            pass
            
        filtered_entities.append(entity)
    
    return filtered_entities

def filter_relations_from_json(
    json_file_path: str,
    head: Optional[str] = None,
    tail: Optional[str] = None,
    relation: Optional[str] = None,
    chunk_id: Optional[str] = None,
    canonical_head: Optional[str] = None,
    canonical_tail: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Filter relations directly from JSON file.
    
    Parameters:
    -----------
    json_file_path : str
        Path to the JSON file containing relations
    head : str, optional
        Filter by head entity
    tail : str, optional
        Filter by tail entity
    relation : str, optional
        Filter by relation type
    chunk_id : str, optional
        Filter by chunk ID
    canonical_head : str, optional
        Filter by canonical head entity
    canonical_tail : str, optional
        Filter by canonical tail entity
        
    Returns:
    --------
    List[Dict[str, Any]]
        List of filtered relation dictionaries
    """
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Assume relations are in 'relations' key or the data itself is a list
    if isinstance(data, dict) and 'relations' in data:
        relations = data['relations']
    elif isinstance(data, list):
        relations = data
    else:
        relations = [data]  # Single relation
    
    filtered_relations = []
    
    for relation_data in relations:
        # Apply filters
        if head and head.lower() not in relation_data.get('head', '').lower():
            continue
            
        if tail and tail.lower() not in relation_data.get('tail', '').lower():
            continue
            
        if relation and relation.lower() not in relation_data.get('relation', '').lower():
            continue
            
        if chunk_id and relation_data.get('chunk_id') != chunk_id:
            continue
            
        if canonical_head and relation_data.get('canonical_head') != canonical_head:
            continue
            
        if canonical_tail and relation_data.get('canonical_tail') != canonical_tail:
            continue
            
        filtered_relations.append(relation_data)
    
    return filtered_relations

def load_and_filter_kg_data(
    kg_folder_path: str,
    entity_filters: Optional[Dict[str, Any]] = None,
    relation_filters: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Load and filter knowledge graph data from a folder containing JSON files.
    
    Parameters:
    -----------
    kg_folder_path : str
        Path to folder containing KG JSON files
    entity_filters : dict, optional
        Filters to apply to entities
    relation_filters : dict, optional
        Filters to apply to relations
        
    Returns:
    --------
    Dict[str, Any]
        Dictionary containing filtered entities and relations
    """
    kg_path = Path(kg_folder_path)
    result = {'entities': [], 'relations': []}
    
    # Find and process entity files
    entity_files = list(kg_path.glob('*entities*.json'))
    for entity_file in entity_files:
        if entity_filters:
            filtered_entities = filter_entities_from_json(str(entity_file), **entity_filters)
        else:
            with open(entity_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                filtered_entities = data if isinstance(data, list) else [data]
        result['entities'].extend(filtered_entities)
    
    # Find and process relation files
    relation_files = list(kg_path.glob('*relations*.json'))
    for relation_file in relation_files:
        if relation_filters:
            filtered_relations = filter_relations_from_json(str(relation_file), **relation_filters)
        else:
            with open(relation_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                filtered_relations = data if isinstance(data, list) else [data]
        result['relations'].extend(filtered_relations)
    
    return result

# Keep the existing DataFrame functions for backward compatibility
def filter_entities(entity_df: pd.DataFrame, **kwargs) -> pd.DataFrame:
    """
    Filter entities based on various criteria.
    
    Parameters:
    -----------
    entity_df : pd.DataFrame
        Entity DataFrame to filter
    entity_type : str, optional
        Filter by entity type
    entity_name : str, optional
        Filter by entity name (supports partial matching)
    chunk_id : str, optional
        Filter by chunk ID
    canonical_entity : str, optional
        Filter by canonical entity name
    attributes_filter : dict, optional
        Filter by entity attributes
        
    Returns:
    --------
    pd.DataFrame
        Filtered entity DataFrame
    """
    filtered_df = entity_df.copy()
    
    entity_type = kwargs.get('entity_type')
    entity_name = kwargs.get('entity_name')
    chunk_id = kwargs.get('chunk_id')
    canonical_entity = kwargs.get('canonical_entity')
    attributes_filter = kwargs.get('attributes_filter')

    if entity_type:
        filtered_df = filtered_df[filtered_df['entity_type'] == entity_type]
    
    if entity_name:
        filtered_df = filtered_df[filtered_df['entity_name'].str.contains(entity_name, case=False, na=False)]
    
    if chunk_id:
        filtered_df = filtered_df[filtered_df['chunk_id'] == chunk_id]
    
    if canonical_entity:
        if 'canonical_entity' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['canonical_entity'] == canonical_entity]
    
    # TODO: Implement attributes filtering based on your attribute structure
    if attributes_filter:
        # This would depend on how attributes are structured in your data
        pass
    
    return filtered_df

def filter_relations(relation_df: pd.DataFrame, **kwargs) -> pd.DataFrame:
    """
    Filter relations based on various criteria.
    
    Parameters:
    -----------
    relation_df : pd.DataFrame
        Relation DataFrame to filter
    head : str, optional
        Filter by head entity
    tail : str, optional
        Filter by tail entity
    relation : str, optional
        Filter by relation type
    chunk_id : str, optional
        Filter by chunk ID
    canonical_head : str, optional
        Filter by canonical head entity
    canonical_tail : str, optional
        Filter by canonical tail entity
        
    Returns:
    --------
    pd.DataFrame
        Filtered relation DataFrame
    """
    filtered_df = relation_df.copy()
    
    head = kwargs.get('head')
    tail = kwargs.get('tail')
    relation = kwargs.get('relation')
    chunk_id = kwargs.get('chunk_id')
    canonical_head = kwargs.get('canonical_head')
    canonical_tail = kwargs.get('canonical_tail')

    if head:
        filtered_df = filtered_df[filtered_df['head'].str.contains(head, case=False, na=False)]
    
    if tail:
        filtered_df = filtered_df[filtered_df['tail'].str.contains(tail, case=False, na=False)]
    
    if relation:
        filtered_df = filtered_df[filtered_df['relation'].str.contains(relation, case=False, na=False)]
    
    if chunk_id:
        filtered_df = filtered_df[filtered_df['chunk_id'] == chunk_id]
    
    if canonical_head and 'canonical_head' in filtered_df.columns:
        filtered_df = filtered_df[filtered_df['canonical_head'] == canonical_head]
    
    if canonical_tail and 'canonical_tail' in filtered_df.columns:
        filtered_df = filtered_df[filtered_df['canonical_tail'] == canonical_tail]
    
    return filtered_df

def get_entity_neighbors(
    graph: nx.Graph,
    entity: str,
    max_hops: int = 1
) -> List[str]:
    """
    Get neighboring entities in the knowledge graph.
    
    Parameters:
    -----------
    graph : nx.Graph
        Knowledge graph
    entity : str
        Target entity
    max_hops : int, default=1
        Maximum number of hops to consider
        
    Returns:
    --------
    List[str]
        List of neighboring entities
    """
    if entity not in graph:
        return []
    
    if max_hops == 1:
        return list(graph.neighbors(entity))
    else:
        # BFS for multi-hop neighbors
        visited = set()
        queue = [(entity, 0)]
        neighbors = []
        
        while queue:
            current, hop = queue.pop(0)
            if current in visited or hop >= max_hops:
                continue
            
            visited.add(current)
            if hop > 0:  # Don't include the starting entity
                neighbors.append(current)
            
            for neighbor in graph.neighbors(current):
                if neighbor not in visited:
                    queue.append((neighbor, hop + 1))
        
        return neighbors

def search_entities_by_keywords(
    entity_df: pd.DataFrame,
    keywords: List[str],
    search_in: List[str] = ['entity_name']
) -> pd.DataFrame:
    """
    Search entities by keywords.
    
    Parameters:
    -----------
    entity_df : pd.DataFrame
        Entity DataFrame
    keywords : List[str]
        Keywords to search for
    search_in : List[str], default=['entity_name']
        Columns to search in
        
    Returns:
    --------
    pd.DataFrame
        Entities matching the keywords
    """
    mask = pd.Series([False] * len(entity_df))
    
    for keyword in keywords:
        for column in search_in:
            if column in entity_df.columns:
                mask |= entity_df[column].str.contains(keyword, case=False, na=False)
    
    return entity_df[mask]