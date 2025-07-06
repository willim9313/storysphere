"""
# canonical_entity_pipeline.py
This module implements a pipeline for canonicalizing entity names in a knowledge graph.
It includes loading entity data, computing embeddings, canonicalizing names, aggregating attributes,
and updating the entity dataframe with canonical names.
通常要先執行此pipeline, 然後再執行graph_construction_pipeline.py來建立知識圖譜。
"""
from core.kg.loader import load_entity_dataset, load_relation_dataset
from core.kg.embedding import load_sentence_transformer, compute_entity_embeddings
from core.kg.entity_linker import canonicalize_entities, aggregate_attributes
from core.kg.dataset_updater import update_entity_df_with_canonical, update_relation_df_with_canonical

def run_canonical_entity_pipeline(
    entity_path: str, 
    relation_path: str,
    model_name: str='all-MiniLM-L6-v2', 
    threshold: float=0.95, 
    strategy: str='longest'
) -> dict:
    """
    Run the canonical entity pipeline.
    :param entity_path: Path to the entity dataset.
    :param relation_path: Path to the relation dataset.
    :param model_name: Name of the sentence transformer model to use for embeddings.
    :param threshold: Similarity threshold for canonicalization.
    :param strategy: Strategy for handling multiple canonical names (e.g., 'longest',

    :return: A dictionary containing:
        - entity_df: DataFrame with updated entity names using canonical names.
        - relation_df: DataFrame with updated relations using canonical entity names.
        - kg_entity_set: Set of unique entities in the knowledge graph.
        - embedding_dict: Dictionary of entity embeddings.
        - canonical_map: Mapping of original entity names to canonical names.
        - canonical_entity_attributes: Aggregated attributes for canonical entities.
        - connected_components: List of connected components in the canonicalization graph.
    """
    # Step 1: Load entity data
    entity_df, kg_entity_set = load_entity_dataset(entity_path)

    # Step 2: Load embedding model and compute entity embeddings
    model = load_sentence_transformer(model_name)
    embedding_dict = compute_entity_embeddings(entity_df, model)

    # Step 3: Canonicalize entity names
    canonical_map, connected_components = canonicalize_entities(
        entity_df, 
        embedding_dict, 
        threshold, 
        strategy
    )

    # Step 4: Aggregate canonical attributes
    canonical_entity_attributes = aggregate_attributes(entity_df, canonical_map)

    # Step 5: Update entity dataframe with canonical names
    entity_df = update_entity_df_with_canonical(entity_df, canonical_map)

    # Step 6: Load relation data
    relation_df, kg_relation_set = load_relation_dataset(relation_path)

    # Step 7: Update relation dataframe with canonical head and tail
    relation_df = update_relation_df_with_canonical(
        relation_df, 
        canonical_map
    )

    return {
        "entity_df": entity_df,
        "relation_df": relation_df,
        "kg_entity_set": kg_entity_set,
        "embedding_dict": embedding_dict,
        "canonical_map": canonical_map,
        "canonical_entity_attributes": canonical_entity_attributes,
        "connected_components": connected_components
    }
