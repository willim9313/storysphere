"""
資料清理工具，專門處理模板引擎敏感字符
"""
import json
import re
from typing import Any, Dict, List, Union

class DataSanitizer:
    """處理模板引擎敏感字符的工具類"""
    
    @staticmethod
    def sanitize_for_template(data: Any) -> str:
        """
        將任意資料轉換為模板安全的字串
        
        Args:
            data: 要處理的資料
            
        Returns:
            str: 安全的字串表示
        """
        if isinstance(data, dict):
            return DataSanitizer._dict_to_safe_text(data)
        elif isinstance(data, list):
            return DataSanitizer._list_to_safe_text(data)
        else:
            return DataSanitizer._escape_template_chars(str(data))
    
    @staticmethod
    def _dict_to_safe_text(data: Dict) -> str:
        """將字典轉換為安全文本"""
        lines = []
        for key, value in data.items():
            safe_value = DataSanitizer.sanitize_for_template(value)
            lines.append(f"{key}: {safe_value}")
        return "\n".join(lines)
    
    @staticmethod
    def _list_to_safe_text(data: List) -> str:
        """將列表轉換為安全文本"""
        if not data:
            return "None"
        
        lines = []
        for i, item in enumerate(data, 1):
            if isinstance(item, dict):
                # 特別處理關係資料
                if all(k in item for k in ['head', 'relation', 'tail']):
                    safe_text = f"{item['head']} {item['relation']} {item['tail']}"
                else:
                    safe_text = DataSanitizer._dict_to_safe_text(item)
                lines.append(f"  {i}. {safe_text}")
            else:
                safe_text = DataSanitizer.sanitize_for_template(item)
                lines.append(f"  {i}. {safe_text}")
        return "\n".join(lines)
    
    @staticmethod
    def _escape_template_chars(text: str) -> str:
        """轉義模板敏感字符"""
        # 移除或替換可能被模板引擎誤判的字符
        # 替換單引號為雙引號，或直接移除
        text = text.replace("'", '"')
        # 可以根據需要添加更多轉義規則
        return text

    @staticmethod
    def format_vector_store_results(results: List[Dict]) -> List[str]:
        # 這邊寫得很差
        """
        專門處理向量資料庫查詢結果
        
        Args:
            results: 向量資料庫查詢結果
            
        Returns:
            List[str]: 格式化後的安全字串列表
        """
        formatted = []
        for r in results:
            if 'payload' not in r:
                continue
                
            payload = r['payload']
            info_parts = []
            
            # Chunk ID
            chunk_id = payload.get('chunk_id', 'N/A')
            info_parts.append(f"Chunk ID: {chunk_id}")
            
            # Content
            content = payload.get('chunk', '')
            safe_content = DataSanitizer._escape_template_chars(content)
            info_parts.append(f"Content: {safe_content}")
            
            # Relations
            if 'kg_relations' in payload and payload['kg_relations']:
                relations_text = "Relations:"
                safe_relations = DataSanitizer.sanitize_for_template(payload['kg_relations'])
                relations_text += f"\n{safe_relations}"
                info_parts.append(relations_text)
            
            formatted.append("\n".join(info_parts) + "\n---")
        
        return formatted
    
class SafeFormatter:
    @staticmethod
    def escape_braces(text):
        """轉義大括號以避免格式化衝突"""
        return text.replace('{', '{{').replace('}', '}}')
    
    @staticmethod
    def format_with_json(template, json_data, **kwargs):
        """安全地格式化包含 JSON 的模板"""
        # 如果是字典，先轉為 JSON 字符串
        if isinstance(json_data, (dict, list)):
            json_str = json.dumps(json_data, ensure_ascii=False, indent=2)
        else:
            json_str = str(json_data)
        
        # 轉義 JSON 中的大括號
        escaped_json = SafeFormatter.escape_braces(json_str)
        
        # 安全格式化
        return template.format(ref_info=escaped_json, **kwargs)