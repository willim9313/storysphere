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
    input_format: str = ""
    output_format: str = ""
    constraints: str = ""
    examples: str = ""
    language: Language = Language.CHINESE
    
    def render(self, **kwargs) -> str:
        """渲染完整的 prompt"""
        template = f"""
{self.system_prompt}

{self._get_section_header('task')}：
{self.task_instruction}

{self._get_section_header('input')}：
{self.input_format}

{self._get_section_header('output')}：
{self.output_format}

{self._get_section_header('constraints')}：
{self.constraints}

{self.examples}

{self._get_section_header('actual_input')}：
{kwargs.get('content', '')}
"""
        return template.strip().format(**kwargs)
    
    def _get_section_header(self, section: str) -> str:
        """根據語言獲取段落標題"""
        headers = {
            Language.CHINESE: {
                'task': '任務指示',
                'input': '輸入格式',
                'output': '輸出格式',
                'constraints': '限制條件',
                'actual_input': '實際輸入'
            },
            Language.ENGLISH: {
                'task': 'Task Instructions',
                'input': 'Input Format',
                'output': 'Output Format',
                'constraints': 'Constraints',
                'actual_input': 'Actual Input'
            }
        }
        return headers[self.language][section]