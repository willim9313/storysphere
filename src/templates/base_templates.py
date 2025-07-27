"""
多語言基底模板模組
設定完整的base prompt template結構
"""
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

class Language(Enum):
    CHINESE = "zh"
    ENGLISH = "en"

@dataclass
class BaseTemplate:
    """基底模板結構"""
    system_prompt: str = ""
    task_instruction: str = ""
    ref_info: Optional[str] = None  # 新增參考資訊欄位
    examples: str = ""
    constraints: str = ""
    output_format: str = ""
    language: Language = Language.ENGLISH  # 預設語言為英文
    
    def render(self, **kwargs) -> str:
        """渲染完整的 prompt"""
        ref_info = kwargs.get("ref_info", self.ref_info)
        examples = kwargs.get("examples", self.examples)
        template = f"""{self.system_prompt}

{self._get_section_header('task')}:
{self.task_instruction}
{self._get_section_header('ref_info') if ref_info else ''}{':' if ref_info else ''}
{self.ref_info if ref_info else ''}
{self._get_section_header('examples') if examples else ''}{':' if examples else ''}
{self.examples if examples else ''}

{self._get_section_header('constraints')}:
{self.constraints}

{self._get_section_header('input')}:
{kwargs.get('content', '')}

{self._get_section_header('output_format')}:
{self.output_format}
"""
        return template.strip().format(**kwargs)
    
    def _get_section_header(self, section: str) -> str:
        """根據語言獲取段落標題"""
        headers = {
            Language.CHINESE: {
                'task': '#任務指示',
                'ref_info': '#參考資訊(可用選項)',
                'examples': '#範例',
                'constraints': '#限制條件',
                'input': '#輸入資料',
                'output_format': '#輸出格式',
            },
            Language.ENGLISH: {
                'task': '#Task Instructions',
                'ref_info': '#Reference Information (Optional Choices)',
                'examples': '#Examples',
                'constraints': '#Constraints',
                'input': '#Input Data',
                'output_format': '#Output Format',
            },
        }
        return headers[self.language][section]