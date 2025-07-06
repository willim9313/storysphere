import networkx as nx
import pandas as pd
import matplotlib.pyplot as plt

def build_knowledge_graph(
    entity_df: pd.DataFrame, 
    relation_df: pd.DataFrame, 
    canonical_entity_attributes: dict
) -> nx.Graph:
    """
    Build a knowledge graph from entity and relation dataframes.
    entity_df: DataFrame containing entity data with columns ['canonical_entity', 'entity_type', ...]
    relation_df: DataFrame containing relation data with columns ['canonical_head', 'canonical_tail', 'relation']
    canonical_entity_attributes: Dictionary mapping canonical entity names to their attributes.
    """
    # 因為前面建立沒有做好，這邊必須取出都有的才拿去畫圖
    relation_df = relation_df.dropna(subset=['canonical_head', 'canonical_tail'])
    valid_set = set(relation_df['canonical_head'].tolist() + relation_df['canonical_tail'].tolist())
    entity_df = entity_df[entity_df['canonical_entity'].isin(valid_set)]

    # Create a knowledge graph
    G = nx.Graph()
    for _, row in entity_df.iterrows():
        canonical = row['canonical_entity']
        merged_attributes = canonical_entity_attributes.get(canonical, {})
        
        G.add_node(
            canonical, 
            type=row['entity_type'], 
            attributes=merged_attributes
        )

    for _, row in relation_df.iterrows():
        G.add_edge(
            row['canonical_head'], 
            row['canonical_tail'], 
            label=row['relation']
        )

    return G

def visualize_knowledge_graph(G) -> None:
    """Visualize the knowledge graph using NetworkX and Matplotlib."""
    pos = nx.spring_layout(G, seed=42, k=0.9)
    labels = nx.get_edge_attributes(G, 'label')
    plt.figure(figsize=(12, 10))
    nx.draw(G, pos, with_labels=True, font_size=10, node_size=700, node_color='lightblue', edge_color='gray', alpha=0.6)
    nx.draw_networkx_edge_labels(G, pos, edge_labels=labels, font_size=8, label_pos=0.3, verticalalignment='baseline')
    plt.title('Knowledge Graph')
    plt.show()
