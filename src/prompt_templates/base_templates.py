"""
多語言基底模板模組
設定完整的base prompt template結構
"""
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

class Language(Enum):
    """新增語言代表"""
    CHINESE = "zh"
    ENGLISH = "en"

@dataclass
class BaseTemplate:
    """基底模板結構"""
    system_prompt: str = "" # 預設系統提示, 最上層級
    task_instruction: str = "" # 任務指示, 在具備系統提示後的第一段, 沒有任務下可為空
    ref_info: Optional[str] = None  # 搭配任務指示, 可選擇性新增參考資訊欄位
    examples: str = "" # 搭配任務指示, 可選擇性新增範例欄位 
    constraints: str = "" # 限制條件, 通常為固定格式
    content: str = "" # 內容, 根據任務調整(header=input)
    output_format: str = "" # 輸出格式, 根據任務調整格式

    language: Language = Language.ENGLISH  # 預設語言為英文
    
    def render(self, **kwargs) -> str:
        """
        渲染完整的 prompt
        ref_info, examples 如果都沒有提供的話，會連同header一起省略
        """
        ref_info = kwargs.get("ref_info", self.ref_info)
        examples = kwargs.get("examples", self.examples)

        template = (
            f"{self._get_section_header('system_prompt')}:\n"
            f"{self.system_prompt}\n\n"
            f"{self._get_section_header('task')}:\n"
            f"{self.task_instruction}\n"
            f"{self._get_section_header('ref_info') if ref_info else ''}{':' if ref_info else ''}\n"
            f"{self.ref_info if ref_info else ''}\n"
            f"{self._get_section_header('examples') if examples else ''}{':' if examples else ''}\n"
            f"{self.examples if examples else ''}\n"
            f"{self._get_section_header('constraints')}:\n"
            f"{self.constraints}\n"
            f"{self._get_section_header('input')}:\n"
            f"{kwargs.get('content', '')}\n"
            f"{self._get_section_header('output_format')}:\n"
            f"{self.output_format}\n"
        )
        return template.strip().format(**kwargs)
    
    def render_split(self, **kwargs) -> Dict[str, str]:
        """
        渲染分離式的 prompt 結構
        適合可以分拆system instruction的LLM
        將user input的部分限在 user_message
        返回一個字典，包含 system_message 和 user_message
        """
        # 提取可選參數
        ref_info = kwargs.get("ref_info", self.ref_info)
        examples = kwargs.get("examples", self.examples)

        # System message 部分
        system_content = f"""{self._get_section_header('system_prompt')}:
{self.system_prompt}

{self._get_section_header('task')}:
{self.task_instruction}
{self._get_section_header('ref_info') if ref_info else ''}{':' if ref_info else ''}
{self.ref_info if ref_info else ''}
{self._get_section_header('examples') if examples else ''}{':' if examples else ''}
{self.examples if examples else ''}

{self._get_section_header('constraints')}:
{self.constraints}

{self._get_section_header('output_format')}:
{self.output_format}""".strip()

        # User message 部分
        user_content = f"""{self._get_section_header('input')}:
{kwargs.get('content', '')}""".strip()


        try:
            output = {
                "system_message": system_content.format(**kwargs),
                "user_message": user_content.format(**kwargs)
            }
        except KeyError as e:
            print(f"system_prompt = {self.system_prompt}")
            print(f"task = {self.task_instruction}")
            # print(f"ref_info = {ref_info}")
            print(f"examples = {examples}")
            print(f"message: {kwargs}")
            print(f"constraints: {self.constraints}")
            print(f"output_format: {self.output_format}")
            raise KeyError(f"Missing key in kwargs for formatting: {e}")
        return output

    def _get_section_header(self, section: str) -> str:
        """根據語言獲取段落標題"""
        headers = {
            Language.CHINESE: {
                'system_prompt': '# 系統提示',
                'task': '# 任務指示',
                'ref_info': '# 參考資訊',
                'examples': '# 範例',
                'constraints': '# 限制條件',
                'input': '# 輸入資料',
                'output_format': '# 輸出格式',
            },
            Language.ENGLISH: {
                'system_prompt': '# System Prompt',
                'task': '# Task Instructions',
                'ref_info': '# Reference Information',
                'examples': '# Examples',
                'constraints': '# Constraints',
                'input': '# Input Data',
                'output_format': '# Output Format',
            },
        }
        return headers[self.language][section]