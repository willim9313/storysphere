"""
# graph_construction_pipeline.py
This module implements a pipeline for constructing a knowledge graph from relation data.
It includes loading relation data, updating the relation dataframe with canonical entities,
building the knowledge graph, and optionally visualizing it.
通常要先執行canonical_entity_pipeline, 然後再執行此pipeline
本pipeline中主要目的是建立知識圖譜，但是會同時更新relation_df中的head和tail為canonical entity。
"""
import pandas as pd
import networkx as nx
from src.core.kg.loader import load_relation_dataset
from src.core.kg.dataset_updater import update_relation_df_with_canonical
from src.core.kg.graph_builder import build_knowledge_graph, visualize_knowledge_graph

def run_graph_construction_pipeline(
    entity_df: pd.DataFrame, 
    relation_df: pd.DataFrame,
    canonical_entity_attributes: dict, 
    visualize: bool = False
) -> dict:
    """
    Run the graph construction pipeline.
    :param entity_df: DataFrame containing entity data.
    :param relation_df: DataFrame containing relation data.
    :param canonical_entity_attributes: Aggregated attributes for canonical entities.
    :param visualize: Whether to visualize the knowledge graph.
    """
    # Step 1: Build knowledge graph
    G = build_knowledge_graph(
        entity_df, 
        relation_df, 
        canonical_entity_attributes
    )

    # Step 2 (optional): Visualize the graph
    if visualize:
        visualize_knowledge_graph(G)

    return {
        "graph": G
    }
