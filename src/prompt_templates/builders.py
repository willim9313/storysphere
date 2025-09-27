# src/prompt_templates/builders.py
from .template import FlexibleTemplate
from .components import PromptSection, SectionType


class TemplateBuilder:
    """模板建構器"""

    def __init__(self):
        self.sections = []

    def _add_or_replace_section(
        self,
        section_type: SectionType,
        content: str,
        **kwargs
    ) -> None:
        """Add section or replace existing section of same type."""
        # Remove existing section of same type
        self.sections = [s for s in self.sections if s.section_type != section_type]

        # Add new section
        section = PromptSection(
            section_type=section_type,
            content=content,
            **kwargs
        )
        self.sections.append(section)

    def system_prompt(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.SYSTEM_PROMPT, content, **kwargs)

    def task_instruction(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.TASK_INSTRUCTION, content, **kwargs)

    def reference_info(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.REFERENCE_INFO, content, **kwargs)

    def examples(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.EXAMPLES, content, **kwargs)

    def constraints(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.CONSTRAINTS, content, **kwargs)

    def input_data(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.INPUT_DATA, content, **kwargs)

    def output_format(self, content: str, **kwargs):
        return self._add_or_replace_section(SectionType.OUTPUT_FORMAT, content, **kwargs)

    def build(self, name: str, language: str = "en") -> FlexibleTemplate:
        """建構模板"""
        return FlexibleTemplate(
            name=name,
            language=language,
            sections=self.sections.copy()
        )
