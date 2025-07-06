from sentence_transformers import SentenceTransformer
import numpy as np
import pandas as pd

def load_sentence_transformer(
    model_name: str='all-MiniLM-L6-v2'
) -> SentenceTransformer:
    """
    Load a sentence transformer model for entity linking.
    
    Parameters:
    -----------
    model_name : str, default='all-MiniLM-L6-v2'
        Name of the sentence transformer model to load
    """
    model = SentenceTransformer(model_name)
    return model

def compute_entity_embeddings(
    entity_df: pd.DataFrame, 
    model: SentenceTransformer
) -> dict[str, np.ndarray]:
    """
    Compute embeddings for all entities in the entity DataFrame.
    """
    if entity_df is None:
        raise ValueError("entity_df cannot be None")

    unique_entities = entity_df['entity_name'].unique()
    embeddings = model.encode(unique_entities)
    embedding_dict = {
        entity: emb for entity, emb in zip(unique_entities, embeddings)
    }
    return embedding_dict