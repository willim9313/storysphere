import sys
sys.path.append("src")
sys.path.append("src/pipelines")  # Add this line to ensure 'pipelines' is in the path

import json
from src.pipelines.kg.canonical_entity_pipeline import run_canonical_entity_pipeline
from src.pipelines.kg.graph_construction_pipeline import run_graph_construction_pipeline

def run_full_kg_workflow(
    entity_path, 
    relation_path, 
    output_dir='./data/kg_storage', 
    model_name='all-MiniLM-L6-v2', 
    threshold=0.95, 
    strategy='longest'
) -> None:
    # Step 1: Canonical entity pipeline
    entity_result = run_canonical_entity_pipeline(
        entity_path=entity_path,
        relation_path=relation_path,
        model_name=model_name,
        threshold=threshold,
        strategy=strategy
    )

    # Step 2: Graph construction pipeline
    graph_result = run_graph_construction_pipeline(
        entity_df=entity_result["entity_df"],
        relation_df=entity_result["relation_df"],
        canonical_entity_attributes=entity_result["canonical_entity_attributes"],
        visualize=True
    )

    # Step 3: Export (optional)
    # 後面可能要拆成args來決定是否要進行
    entity_result["entity_df"].to_csv(f"{output_dir}/entity_df.csv", index=False)
    with open(f"{output_dir}/canonical_entity_attributes.json", "w") as f:
        json.dump(entity_result["canonical_entity_attributes"], f, indent=2)
    entity_result["relation_df"].to_csv(f"{output_dir}/relation_df.csv", index=False)

    print("Workflow completed.")

if __name__ == "__main__":
    run_full_kg_workflow(
        entity_path="./data/kg_storage/kg_entity_set.json",
        relation_path="./data/kg_storage/kg_relation_set.json"
    )