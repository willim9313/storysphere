# src/prompt_templates/prompt_loader.py
import os
from pathlib import Path
from typing import Dict, Optional

# 簡單的 YAML 解析器（避免依賴外部庫）
def simple_yaml_load(content: str) -> Dict:
    """簡單的 YAML 解析器，只處理我們需要的格式"""
    lines = content.strip().split('\n')
    data = {}
    current_key = None
    current_value = []
    in_multiline = False
    sections_data = {}
    
    for line in lines:
        line = line.rstrip()
        
        # 跳過註解和空行
        if line.startswith('#') or not line.strip():
            continue
            
        # 檢查縮排
        if line.startswith('  ') and current_key:
            if line.strip().endswith('|'):
                # 新的 section 開始 - 先保存上一個
                if current_key == 'sections' and len(current_value) > 1:
                    sections_key = current_value[0]
                    sections_content = '\n'.join(current_value[1:])
                    sections_data[sections_key] = sections_content
                
                # 開始新的 section
                in_multiline = True
                sub_key = line.strip().replace(':', '').replace('|', '').strip()
                current_value = [sub_key]
                continue
            elif in_multiline:
                # 多行字串內容
                if line.startswith('    '):
                    current_value.append(line[4:])  # 移除 4 個空格的縮排
                elif line.startswith('  ') and ':' in line:
                    # 新的 section 開始 - 先保存上一個
                    if current_key == 'sections' and len(current_value) > 1:
                        sections_key = current_value[0]
                        sections_content = '\n'.join(current_value[1:])
                        sections_data[sections_key] = sections_content
                    
                    sub_key = line.strip().replace(':', '').replace('|', '').strip()
                    current_value = [sub_key]
        else:
            # 處理前一個 key 的值
            if current_key and current_value:
                if current_key == 'sections' and len(current_value) > 1:
                    sections_key = current_value[0]
                    sections_content = '\n'.join(current_value[1:])
                    sections_data[sections_key] = sections_content
                elif current_key != 'sections':
                    data[current_key] = '\n'.join(current_value) if len(current_value) > 1 else current_value[0]
            
            # 新的 key
            if ':' in line:
                parts = line.split(':', 1)
                current_key = parts[0].strip()
                value = parts[1].strip()
                if value:
                    if value.startswith('"') and value.endswith('"'):
                        data[current_key] = value[1:-1]
                    else:
                        data[current_key] = value
                    current_key = None
                else:
                    current_value = []
                    in_multiline = False
    
    # 處理最後一個 key
    if current_key and current_value:
        if current_key == 'sections' and len(current_value) > 1:
            sections_key = current_value[0]
            sections_content = '\n'.join(current_value[1:])
            sections_data[sections_key] = sections_content
        elif current_key != 'sections':
            data[current_key] = '\n'.join(current_value) if len(current_value) > 1 else current_value[0]
    
    # 將 sections 數據加入主數據
    if sections_data:
        data['sections'] = sections_data
    
    return data


class PromptLoader:
    """簡單的 prompt YAML 文件載入器"""
    
    def __init__(self, prompts_dir: str = None):
        if prompts_dir is None:
            prompts_dir = str(Path(__file__).parent / "prompts")
        self.prompts_dir = Path(prompts_dir)
    
    def load_template_data(self, task_type: str, language: str) -> Dict:
        """載入模板數據"""
        filename = f"{task_type}_{language}.yaml"
        file_path = self.prompts_dir / filename
        
        if not file_path.exists():
            raise FileNotFoundError(f"Template file not found: {filename}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return simple_yaml_load(content)
    
    def list_available_templates(self) -> Dict[str, list]:
        """列出所有可用的模板"""
        templates = {}
        
        if not self.prompts_dir.exists():
            return templates
        
        for file_path in self.prompts_dir.iterdir():
            if file_path.suffix.lower() in ['.yaml', '.yml']:
                # 解析檔名：task_type_language.yaml
                file_stem = file_path.stem
                if '_' in file_stem:
                    parts = file_stem.split('_')
                    if len(parts) >= 2:
                        # 最後一個部分是語言，前面的都是任務類型
                        language = parts[-1]
                        task_type = '_'.join(parts[:-1])
                        
                        if task_type not in templates:
                            templates[task_type] = []
                        if language not in templates[task_type]:
                            templates[task_type].append(language)
        
        return templates

# 全局實例
prompt_loader = PromptLoader()
