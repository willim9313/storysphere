from typing import List, Optional, Literal, Union, Type, Tuple, Any, Optional
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
import json
import re

# ------------------
# Pydantic Models
# ------------------
class SummaryResponse(BaseModel):
    respond: str = Field(..., description="The summarized context text")

class ExtractedKeywords(BaseModel):
    respond: List[str] = Field(..., description="List of extracted keywords from the text")


# ------------------
# Validation Function
# ------------------
def validate_summary_output(output: Any, 
                            schema_cls: Type[BaseModel]=SummaryResponse) -> Tuple[Optional[BaseModel], Optional[ValidationError]]:
    """
    將LLM輸出的JSON資料驗證成指定的Pydantic結構。
    
    :param output: LLM回傳的資料（可為dict或json反序列化後的物件）
    :param schema_cls: 欲驗證的Pydantic類別
    :return: 驗證成功則回傳 (obj, None)，否則回傳 (None, error)
    """
    try:
        obj = schema_cls.model_validate(output)
        return obj, None
    except ValidationError as e:
        return None, e

def validate_extracted_keywords(output: Any) -> Tuple[Optional[ExtractedKeywords], Optional[ValidationError]]:
    """
    將LLM輸出的JSON資料驗證成ExtractedKeywords結構。
    
    :param output: LLM回傳的資料（可為dict或json反序列化後的物件）
    :return: 驗證成功則回傳 (obj, None)，否則回傳 (None, error)
    """
    try:
        obj = ExtractedKeywords.model_validate(output)
        return obj, None
    except ValidationError as e:
        return None, e
    
if __name__ == "__main__":

    result = {"respond": "This is the summary."}
    obj = SummaryResponse.model_validate(result)
    print(obj.respond)  # ✅ OK

    result = {"respond": ["keyword1", "keyword2"]}
    obj = ExtractedKeywords.model_validate(result)
    print(obj.respond)  # ✅ OK