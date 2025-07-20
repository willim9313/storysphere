"""
Entity Attribute Extraction Pipeline
通用實體屬性提取管道，支援從知識圖譜中提取各種類型實體的屬性信息
包括角色（Person）、地點（Location）、組織（Organization）等各類實體
"""
import json
import pandas as pd
from typing import Dict, List, Any, Optional, Union
from pathlib import Path

from src.core.kg.kg_retriever import (
    filter_entities, 
    filter_entities_from_json, 
    load_and_filter_kg_data
)


class EntityAttributeExtractionPipeline:
    """
    實體屬性提取管道類別
    支援從DataFrame或JSON文件中提取實體屬性信息
    """
    
    def __init__(
        self, 
        data_source: Union[str, pd.DataFrame, Path, Dict[str, Any]],
        source_type: str = 'auto'
    ):
        """
        初始化實體屬性提取管道
        
        Parameters:
        -----------
        data_source : Union[str, pd.DataFrame, Path, Dict[str, Any]]
            數據源，可以是CSV文件路徑、JSON文件路徑、DataFrame或已加載的數據字典
        source_type : str, default='auto'
            數據源類型：'auto', 'dataframe', 'json_file', 'csv_file', 'json_data'
        """
        self.data_source = data_source
        self.source_type = source_type
        self.entity_df = None
        self.entities_data = None
        
        self._load_data()

    def _load_data(self) -> None:
        """加載數據"""
        if self.source_type == 'auto':
            self._auto_detect_and_load()
        elif self.source_type == 'dataframe':
            self.entity_df = self.data_source
        elif self.source_type == 'json_file':
            self._load_from_json_file()
        elif self.source_type == 'csv_file':
            self.entity_df = pd.read_csv(self.data_source)
        elif self.source_type == 'json_data':
            self.entities_data = self.data_source

    def _auto_detect_and_load(self) -> None:
        """自動檢測數據源類型並加載"""
        if isinstance(self.data_source, pd.DataFrame):
            self.entity_df = self.data_source
        elif isinstance(self.data_source, dict):
            self.entities_data = self.data_source
        elif isinstance(self.data_source, (str, Path)):
            file_path = Path(self.data_source)
            if file_path.suffix.lower() == '.csv':
                self.entity_df = pd.read_csv(file_path)
            elif file_path.suffix.lower() == '.json':
                self._load_from_json_file()
            else:
                raise ValueError(f"Unsupported file format: {file_path.suffix}")
        else:
            raise ValueError("Unsupported data source type")

    def _load_from_json_file(self) -> None:
        """從JSON文件加載數據"""
        with open(self.data_source, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if isinstance(data, list):
            # 處理實體列表格式
            entities_list = []
            for item in data:
                if 'entities' in item:
                    entities_list.extend(item['entities'])
                else:
                    entities_list.append(item)
            self.entities_data = {'entities': entities_list}
        elif isinstance(data, dict):
            self.entities_data = data
        else:
            self.entities_data = {'entities': [data]}
    
    def extract_entity_attributes(
        self,
        target_entities: Union[str, List[str]],
        entity_type: Optional[str] = None,
        attribute_fields: Optional[List[str]] = None,
        include_basic_info: bool = True,
        chunk_id: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        提取指定實體的屬性
        
        Parameters:
        -----------
        target_entities : Union[str, List[str]]
            目標實體名稱或實體名稱列表
        entity_type : str, optional
            實體類型過濾器（Person, Location, Organization等）
        attribute_fields : List[str], optional
            要提取的特定屬性欄位
        include_basic_info : bool, default=True
            是否包含基本信息
        chunk_id : str, optional
            chunk ID過濾器
            
        Returns:
        --------
        Dict[str, Dict[str, Any]]
            實體屬性字典
        """
        if isinstance(target_entities, str):
            target_entities = [target_entities]
        
        result = {}
        
        for entity_name in target_entities:
            entity_attributes = self._extract_single_entity_attributes(
                entity_name=entity_name,
                entity_type=entity_type,
                attribute_fields=attribute_fields,
                include_basic_info=include_basic_info,
                chunk_id=chunk_id
            )
            result[entity_name] = entity_attributes
        
        return result
    
    def _extract_single_entity_attributes(
        self,
        entity_name: str,
        entity_type: Optional[str] = None,
        attribute_fields: Optional[List[str]] = None,
        include_basic_info: bool = True,
        chunk_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """提取單個實體的屬性"""
        if self.entity_df is not None:
            return self._extract_from_dataframe(
                entity_name, entity_type, attribute_fields, include_basic_info, chunk_id
            )
        elif self.entities_data is not None:
            return self._extract_from_json_data(
                entity_name, entity_type, attribute_fields, include_basic_info, chunk_id
            )
        else:
            return {"error": "No data loaded"}
    
    def _extract_from_dataframe(
        self,
        entity_name: str,
        entity_type: Optional[str] = None,
        attribute_fields: Optional[List[str]] = None,
        include_basic_info: bool = True,
        chunk_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """從DataFrame中提取屬性"""
        # 使用 filter_entities 進行過濾
        filtered_entities = filter_entities(
            self.entity_df,
            entity_name=entity_name,
            entity_type=entity_type,
            chunk_id=chunk_id
        )
        
        if filtered_entities.empty:
            return {"error": "Entity not found"}
        
        # 取第一個匹配的實體
        entity_data = filtered_entities.iloc[0].to_dict()
        return self._process_entity_attributes(
            entity_data, attribute_fields, include_basic_info
        )
    
    def _extract_from_json_data(
        self,
        entity_name: str,
        entity_type: Optional[str] = None,
        attribute_fields: Optional[List[str]] = None,
        include_basic_info: bool = True,
        chunk_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """從JSON數據中提取屬性"""
        entities = self.entities_data.get('entities', [])
        
        matching_entities = []
        for entity in entities:
            # 名稱匹配
            if entity_name.lower() not in entity.get('name', '').lower():
                continue
            # 類型過濾
            if entity_type and entity.get('type') != entity_type:
                continue
            # chunk_id過濾
            if chunk_id and entity.get('chunk_id') != chunk_id:
                continue
            
            matching_entities.append(entity)
        
        if not matching_entities:
            return {"error": "Entity not found"}
        
        # 取第一個匹配的實體
        entity_data = matching_entities[0]
        return self._process_entity_attributes(
            entity_data, attribute_fields, include_basic_info
        )
    
    def _process_entity_attributes(
        self,
        entity_data: Dict[str, Any],
        attribute_fields: Optional[List[str]] = None,
        include_basic_info: bool = True
    ) -> Dict[str, Any]:
        """處理實體屬性數據"""
        attributes = {}
        
        # 基本信息欄位
        basic_fields = ['name', 'type', 'chunk_id', 'entity_name', 'entity_type']
        
        # 如果包含基本信息
        if include_basic_info:
            for field in basic_fields:
                if field in entity_data:
                    attributes[field] = entity_data[field]
        
        # 處理attributes字段（嵌套屬性）
        if 'attributes' in entity_data and isinstance(entity_data['attributes'], dict):
            nested_attrs = entity_data['attributes']
            if attribute_fields:
                for field in attribute_fields:
                    if field in nested_attrs:
                        attributes[field] = nested_attrs[field]
            else:
                attributes.update(nested_attrs)
        
        # 處理其他字段作為屬性
        if attribute_fields:
            for field in attribute_fields:
                if field in entity_data and field not in basic_fields:
                    attributes[field] = entity_data[field]
        else:
            # 包含所有非基本信息的字段
            for key, value in entity_data.items():
                if key not in basic_fields and key != 'attributes':
                    attributes[key] = value
        
        return attributes
    
    def extract_attributes_by_type(
        self,
        entity_type: str,
        attribute_fields: Optional[List[str]] = None,
        limit: Optional[int] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        根據實體類型提取屬性
        
        Parameters:
        -----------
        entity_type : str
            實體類型（Person, Location, Organization等）
        attribute_fields : List[str], optional
            要提取的屬性欄位
        limit : int, optional
            限制結果數量
            
        Returns:
        --------
        Dict[str, Dict[str, Any]]
            該類型所有實體的屬性
        """
        if self.entity_df is not None:
            filtered_entities = filter_entities(self.entity_df, entity_type=entity_type)
            if limit:
                filtered_entities = filtered_entities.head(limit)
            
            result = {}
            for _, row in filtered_entities.iterrows():
                entity_name = row.get('entity_name', row.get('name', 'unknown'))
                entity_data = row.to_dict()
                result[entity_name] = self._process_entity_attributes(
                    entity_data, attribute_fields, include_basic_info=True
                )
            return result
            
        elif self.entities_data is not None:
            entities = self.entities_data.get('entities', [])
            result = {}
            count = 0
            
            for entity in entities:
                if entity.get('type') == entity_type:
                    entity_name = entity.get('name', 'unknown')
                    result[entity_name] = self._process_entity_attributes(
                        entity, attribute_fields, include_basic_info=True
                    )
                    count += 1
                    if limit and count >= limit:
                        break
            
            return result
        
        return {}
    
    def get_entity_summary_by_type(self) -> Dict[str, int]:
        """
        獲取按類型分組的實體數量摘要
        算是可以用來判斷當前實例後的資訊
        
        Returns:
        --------
        Dict[str, int]
            各類型實體的數量統計
        """
        if self.entity_df is not None:
            type_column = 'entity_type' if 'entity_type' in self.entity_df.columns else 'type'
            if type_column in self.entity_df.columns:
                return self.entity_df[type_column].value_counts().to_dict()
        
        elif self.entities_data is not None:
            entities = self.entities_data.get('entities', [])
            type_counts = {}
            for entity in entities:
                entity_type = entity.get('type', 'Unknown')
                type_counts[entity_type] = type_counts.get(entity_type, 0) + 1
            return type_counts
        
        return {}

    def search_entities_with_attributes(
        self,
        search_keywords: List[str],
        search_in_fields: List[str] = ['name', 'description'],
        entity_type: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        根據關鍵字搜索實體並返回其屬性
        
        Parameters:
        -----------
        search_keywords : List[str]
            搜索關鍵字
        search_in_fields : List[str]
            要搜索的字段
        entity_type : str, optional
            實體類型過濾器
            
        Returns:
        --------
        Dict[str, Dict[str, Any]]
            匹配的實體及其屬性
        """
        result = {}
        
        if self.entity_df is not None:
            # DataFrame搜索
            mask = pd.Series([False] * len(self.entity_df))
            for keyword in search_keywords:
                for field in search_in_fields:
                    if field in self.entity_df.columns:
                        mask |= self.entity_df[field].astype(str).str.contains(
                            keyword, case=False, na=False
                        )
            
            filtered_df = self.entity_df[mask]
            if entity_type:
                type_col = 'entity_type' if 'entity_type' in filtered_df.columns else 'type'
                filtered_df = filtered_df[filtered_df[type_col] == entity_type]
            
            for _, row in filtered_df.iterrows():
                entity_name = row.get('entity_name', row.get('name', 'unknown'))
                result[entity_name] = self._process_entity_attributes(row.to_dict())
        
        elif self.entities_data is not None:
            # JSON數據搜索
            entities = self.entities_data.get('entities', [])
            for entity in entities:
                if entity_type and entity.get('type') != entity_type:
                    continue
                
                # 檢查是否匹配關鍵字
                match = False
                for keyword in search_keywords:
                    for field in search_in_fields:
                        field_value = str(entity.get(field, ''))
                        if field == 'description' and 'attributes' in entity:
                            field_value += ' ' + str(entity['attributes'].get('description', ''))
                        
                        if keyword.lower() in field_value.lower():
                            match = True
                            break
                    if match:
                        break
                
                if match:
                    entity_name = entity.get('name', 'unknown')
                    result[entity_name] = self._process_entity_attributes(entity)
        
        return result


def create_entity_attribute_pipeline(
    data_source: Union[str, pd.DataFrame, Path, Dict[str, Any]],
    source_type: str = 'auto'
) -> EntityAttributeExtractionPipeline:
    """
    創建實體屬性提取管道的工廠函數
    
    Parameters:
    -----------
    data_source : Union[str, pd.DataFrame, Path, Dict[str, Any]]
        數據源
    source_type : str, default='auto'
        數據源類型
        
    Returns:
    --------
    EntityAttributeExtractionPipeline
        實體屬性提取管道實例
    """
    return EntityAttributeExtractionPipeline(data_source, source_type)


# 使用範例
if __name__ == "__main__":
    # 範例1: 從JSON文件創建管道
    kg_entity_path = "/Users/williamhuang/projects/storysphere/data/kg_storage/kg_entity_set.json"
    
    pipeline = create_entity_attribute_pipeline(kg_entity_path)
    
    # 獲取實體類型摘要
    print("實體類型摘要:", pipeline.get_entity_summary_by_type())
    
    # 提取特定角色的屬性
    character_attrs = pipeline.extract_entity_attributes(
        target_entities=["Major", "Mr. Jones"],
        entity_type="Person"
    )
    print("角色屬性:", character_attrs)
    
    # 提取所有Person類型實體的屬性
    all_persons = pipeline.extract_attributes_by_type("Person", limit=5)
    print("所有角色:", all_persons)
    
    # 根據關鍵字搜索實體
    search_results = pipeline.search_entities_with_attributes(
        search_keywords=["farm", "animal"],
        entity_type="Location"
    )
    print("搜索結果:", search_results)