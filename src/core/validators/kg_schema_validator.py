from typing import List, Optional, Literal, Union, Tuple
from pydantic import BaseModel, ValidationError, model_validator
import json
import re


# ------------------
# Pydantic Models
# ------------------
class EntityAttributes(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    birthDate: Optional[str] = None
    deathDate: Optional[str] = None
    affiliation: Optional[str] = None


class Entity(BaseModel):
    type: Literal[
        "Person", "Location", "Organization", "Event",
        "Object", "Concept", "Time"
    ]
    name: str
    attributes: Optional[EntityAttributes] = None

    model_config = {
        "extra": "forbid"
    }


class Relation(BaseModel):
    head: str
    relation: Literal[
        "knows", "locatedIn", "partOf", "possesses", "participatesIn",
        "happensAt", "occursDuring", "createdBy", "hasTrait"
    ]
    tail: str

    model_config = {
        "extra": "forbid"
    }


class KnowledgeGraphOutput(BaseModel):
    entities: List[Entity]
    relations: List[Relation]
    chunk_id: Optional[str] = None

    @model_validator(mode="after")
    def check_names_exist(self) -> "KnowledgeGraphOutput":
        entity_names = {e.name for e in self.entities}
        for rel in self.relations:
            if rel.head not in entity_names:
                raise ValueError(f"Head '{rel.head}' not found in entities")
            if rel.tail not in entity_names:
                raise ValueError(f"Tail '{rel.tail}' not found in entities")
        return self


# ------------------
# Validation Function
# ------------------
def validate_kg_output(
    data: Union[str, dict]
) -> Tuple[Optional[KnowledgeGraphOutput], Optional[Exception]]:
    """
    將 LLM 產生的 JSON 結構驗證為 KnowledgeGraphOutput。

    :param data: LLM 回傳的 JSON 物件或字串
    :return: 驗證成功則回傳轉換後的物件；失敗則回傳 None 並顯示錯誤
    """
    try:
        if isinstance(data, str):
            match = re.search(r"(\[.*\]|\{.*\})", data, re.DOTALL)
            data = json.loads(match.group(0)) if match else {}
        result = KnowledgeGraphOutput.model_validate(data)
        return result, None
    except (ValidationError, json.JSONDecodeError, ValueError) as e:
        # 之後加入logging
        return None, e


if __name__ == "__main__":

    raw_json = '''
    {
    "entities": [
        {"type": "Person", "name": "Harry Potter"},
        {"type": "Object", "name": "Invisibility Cloak"}
    ],
    "relations": [
        {"head": "Harry Potter", "relation": "possesses", "tail": "Invisibility Cloak"}
    ]
    }
    '''

    kg_result = validate_kg_output(raw_json)

    if kg_result:
        print("✅ Validation passed")
        print(kg_result.model_dump())
    else:
        print("❌ Validation failed")
