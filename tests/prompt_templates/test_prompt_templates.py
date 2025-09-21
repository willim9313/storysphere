import pytest
from unittest.mock import Mock, patch
from src.prompt_templates.builders import TemplateBuilder
from src.prompt_templates.template import FlexibleTemplate
from src.prompt_templates.components import PromptSection


class TestTemplateBuilder:
    """Test cases for TemplateBuilder class."""
    
    def setup_method(self):
        """Setup method called before each test."""
        self.builder = TemplateBuilder()
    
    def test_builder_initialization(self):
        """Test that builder initializes with empty sections."""
        assert self.builder.sections == []
        assert isinstance(self.builder, TemplateBuilder)
    
    def test_system_prompt_section_creation(self):
        """Test system prompt section creation and chaining."""
        result = self.builder.system_prompt("System message")
        
        # Test method chaining
        assert result is self.builder
        
        # Test section creation
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert isinstance(section, PromptSection)
        assert hasattr(section, 'content')
        assert section.content == "System message"
    
    def test_reference_info_section_creation(self):
        """Test reference info section creation."""
        result = self.builder.reference_info("Reference info")
        
        assert result is self.builder
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert section.content == "Reference info"
    
    def test_task_instruction_section_creation(self):
        """Test task instruction section creation."""
        result = self.builder.task_instruction("Task description")
        
        assert result is self.builder
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert section.content == "Task description"
    
    def test_examples_section_creation(self):
        """Test examples section creation."""
        examples = ["Example 1", "Example 2"]
        result = self.builder.examples(examples)
        
        assert result is self.builder
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert section.content == examples
    
    def test_constraints_section_creation(self):
        """Test constraints section creation."""
        constraints = ["Constraint 1", "Constraint 2"]
        result = self.builder.constraints(constraints)
        
        assert result is self.builder
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert section.content == constraints
    
    def test_output_format_section_creation(self):
        """Test output format section creation."""
        result = self.builder.output_format("JSON format")
        
        assert result is self.builder
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert section.content == "JSON format"
    
    def test_input_data_section_creation(self):
        """Test input data section creation."""
        result = self.builder.input_data("User input")
        
        assert result is self.builder
        assert len(self.builder.sections) == 1
        section = self.builder.sections[0]
        assert section.content == "User input"
    
    def test_method_chaining(self):
        """Test that multiple methods can be chained together."""
        result = (self.builder
                 .system_prompt("System message")
                 .reference_info("Reference info")
                 .task_instruction("Task description")
                 .examples(["Example 1"])
                 .constraints(["Constraint 1"])
                 .output_format("JSON")
                 .input_data("User input"))
        
        # Test chaining returns builder
        assert result is self.builder
        
        # Test all sections are created
        assert len(self.builder.sections) == 7
    
    def test_build_method(self):
        """Test building a FlexibleTemplate from sections."""
        # Setup builder with sections
        self.builder.system_prompt("System").task_instruction("Task").input_data("Input")
        
        # Build template with required name parameter
        template = self.builder.build("test_template", "zh")
        
        # Test template creation
        assert isinstance(template, FlexibleTemplate)
        assert len(template.sections) == 3
    
    def test_build_empty_template(self):
        """Test building template with no sections."""
        template = self.builder.build("empty_template", "zh")
        
        assert isinstance(template, FlexibleTemplate)
        assert len(template.sections) == 0
    
    def test_builder_reuse(self):
        """Test that builder can be reused after building."""
        # First build
        self.builder.system_prompt("System 1")
        template1 = self.builder.build("template1", "zh")
        
        # Reuse builder
        self.builder.system_prompt("System 2")
        template2 = self.builder.build("template2", "zh")

        # Test both templates are independent
        assert len(template1.sections) == 1
        assert len(template2.sections) == 1
        assert template1.sections[0].content == "System 1"
        assert template2.sections[0].content == "System 2"
    
    def test_section_content_types(self):
        """Test different content types for sections."""
        # String content
        self.builder.system_prompt("String content")
        
        # List content
        self.builder.examples(["Item 1", "Item 2"])
        
        # Dict content (if supported)
        self.builder.reference_info({"key": "value"})
        
        template = self.builder.build("content_test", "zh")
        assert len(template.sections) == 3
        assert template.sections[0].content == "String content"
        assert template.sections[1].content == ["Item 1", "Item 2"]
        assert template.sections[2].content == {"key": "value"}
    
    def test_empty_content_handling(self):
        """Test handling of empty or None content."""
        # Empty string
        self.builder.system_prompt("")
        
        # Empty list
        self.builder.examples([])
        
        template = self.builder.build("empty_content_test", "zh")
        assert len(template.sections) == 2
    
    def test_special_characters_in_content(self):
        """Test special characters and unicode in content."""
        special_content = "Special chars: 中文, émoji 🎉, newlines\nand tabs\t"
        self.builder.system_prompt(special_content)
        
        template = self.builder.build("special_chars_test", "zh")
        assert template.sections[0].content == special_content
    
    def test_complex_template_building(self):
        """Test building a complex template with all section types."""
        template = (TemplateBuilder()
                   .system_prompt("You are a helpful assistant")
                   .reference_info("User is asking about AI")
                   .task_instruction("Provide a detailed explanation")
                   .examples([
                       "Q: What is AI? A: Artificial Intelligence is...",
                       "Q: How does ML work? A: Machine Learning..."
                   ])
                   .constraints([
                       "Keep response under 500 words",
                       "Use simple language",
                       "Include examples"
                   ])
                   .output_format("Markdown format with headers")
                   .input_data("What is deep learning?")
                   .build("complex_template", "zh"))
        
        assert isinstance(template, FlexibleTemplate)
        assert len(template.sections) == 7
    
    @pytest.mark.parametrize("content,expected_type", [
        ("string content", str),
        (["list", "content"], list),
        ({"dict": "content"}, dict),
        (123, int),
        (12.34, float),
    ])
    def test_content_type_preservation(self, content, expected_type):
        """Test that different content types are preserved correctly."""
        self.builder.system_prompt(content)
        template = self.builder.build("type_test", "zh")
        
        assert isinstance(template.sections[0].content, expected_type)
        assert template.sections[0].content == content
    
    def test_large_content_handling(self):
        """Test handling of large content."""
        large_content = "A" * 10000  # 10KB of text
        self.builder.system_prompt(large_content)
        
        template = self.builder.build("large_content_test", "zh")
        assert len(template.sections[0].content) == 10000
        assert template.sections[0].content == large_content


class TestTemplateBuilderEdgeCases:
    """Test edge cases and error conditions."""
    
    def test_builder_state_isolation(self):
        """Test that multiple builders don't interfere with each other."""
        builder1 = TemplateBuilder()
        builder2 = TemplateBuilder()
        
        builder1.system_prompt("System 1")
        builder2.system_prompt("System 2")
        
        template1 = builder1.build("template1", "zh")
        template2 = builder2.build("template2", "zh")
        
        assert template1.sections[0].content == "System 1"
        assert template2.sections[0].content == "System 2"
        assert len(template1.sections) == 1
        assert len(template2.sections) == 1


class TestTemplateBuilderIntegration:
    """Integration tests with FlexibleTemplate."""
    
    @patch('src.prompt_templates.builders.FlexibleTemplate')
    def test_build_calls_flexible_template(self, mock_template_class):
        """Test that build method correctly instantiates FlexibleTemplate."""
        mock_template = Mock()
        mock_template_class.return_value = mock_template
        
        builder = TemplateBuilder()
        builder.system_prompt("Test")
        
        result = builder.build("test", "zh")
        
        # Verify FlexibleTemplate was called
        mock_template_class.assert_called_once()
        assert result is mock_template
    
    def test_template_functionality(self):
        """Test that built template works correctly."""
        template = (TemplateBuilder()
                   .system_prompt("You are a {role}")
                   .task_instruction("Explain {topic}")
                   .input_data("{question}")
                   .build("functional_test", "zh"))
        
        # Test that template was created successfully
        assert isinstance(template, FlexibleTemplate)
        assert len(template.sections) == 3

    def test_examples_formatting(self):
        """Test examples section with complex formatting."""
        examples = [
            "Q: Simple question?\nA: Simple answer.",
            {"question": "Complex question?", "answer": "Complex answer."},
            "Multi-line\nexample\nwith formatting"
        ]
        builder = TemplateBuilder()
        builder.examples(examples)
        template = builder.build("examples_test", "zh")
        
        assert template.sections[0].content == examples
        # Test that complex data structures are preserved
    
    def test_reference_info_complex_data(self):
        """Test reference_info with nested data structures."""
        ref_data = {
            "context": {
                "user_profile": {"age": 25, "interests": ["AI", "ML"]},
                "conversation_history": [
                    {"role": "user", "message": "Hello"},
                    {"role": "assistant", "message": "Hi there!"}
                ]
            },
            "metadata": {"timestamp": "2024-01-01", "session_id": "123"}
        }
        builder = TemplateBuilder()
        builder.reference_info(ref_data)
        template = builder.build("ref_test", "zh")
        
        assert template.sections[0].content == ref_data
        assert template.sections[0].content["context"]["user_profile"]["age"] == 25

    def test_section_order_preservation(self):
        """Test that sections maintain their addition order."""
        builder = TemplateBuilder()
        builder.reference_info("Ref")
        builder.system_prompt("System") 
        builder.examples(["Ex1"])
        builder.task_instruction("Task")
        
        template = builder.build("order_test", "zh")
        
        # Verify order is preserved
        contents = [section.content for section in template.sections]
        expected = ["Ref", "System", ["Ex1"], "Task"]
        assert contents == expected

    def test_invalid_content_types(self):
        """Test handling of invalid content types."""
        # Test with None
        builder = TemplateBuilder()
        builder.system_prompt(None)
        
        # Test with complex objects
        class CustomObject:
            pass
        
        builder.reference_info(CustomObject())
        template = builder.build("invalid_test", "zh")
    
    def test_section_override_behavior(self):
        """Test that adding same section type overrides previous one."""
        builder = TemplateBuilder()
        builder.system_prompt("First system message")
        builder.system_prompt("Second system message")  # Should override
        
        template = builder.build("override_test", "zh")
        assert len(template.sections) == 1  # Should only have one section
        assert template.sections[0].content == "Second system message"

    def test_override_functionality(self):  # 添加 self 參數
        """測試 override 功能"""
        from src.prompt_templates.manager import PromptManager
        from src.prompt_templates.registry import TaskType, Language
        
        pm = PromptManager()
        
        # 測試前的原始內容
        original = pm.render_prompt(
            task_type=TaskType.ENTITY_EXTRACTION,
            language=Language.ENGLISH,
            content="測試內容"
        )
        
        # 測試 override
        overridden = pm.render_prompt(
            task_type=TaskType.ENTITY_EXTRACTION,
            language=Language.ENGLISH,
            content="測試內容",
            overrides={
                "examples": "這是覆寫後的範例內容",
                "constraints": "這是覆寫後的限制條件"
            }
        )
        
        print("原始 prompt:")
        print(original)
        print("\n覆寫後的 prompt:")
        print(overridden)
        
        # 驗證是否真的有差異
        assert original != overridden, "Override 功能失效"
        assert "這是覆寫後的範例內容" in overridden
        assert "這是覆寫後的限制條件" in overridden
    
    def test_multiple_section_types_no_override(self):
        """Test that different section types don't override each other."""
        builder = TemplateBuilder()
        builder.system_prompt("System")
        builder.task_instruction("Task")
        builder.system_prompt("New System")  # Override system only
        
        template = builder.build("no_override_test", "zh")
        assert len(template.sections) == 2
        # Verify task_instruction is preserved
        
        # Should handle gracefully or raise appropriate errors
    def debug_override_issue(self):
        """診斷 override 問題"""
        from src.prompt_templates.manager import PromptManager
        from src.prompt_templates.registry import TaskType, Language
        from src.prompt_templates.components import SectionType
        
        pm = PromptManager()
        
        # 1. 檢查原始模板的段落結構
        template = pm.registry.get_template(TaskType.ENTITY_EXTRACTION, Language.ENGLISH)
        print("原始模板的段落:")
        for i, section in enumerate(template.sections):
            print(f"{i}: {section.section_type} - {section.content[:50]}...")
        
        # 2. 檢查 SectionType 的可用值
        print("\nSectionType 枚舉值:")
        for attr_name in dir(SectionType):
            if not attr_name.startswith('_'):
                print(f"  {attr_name}: {getattr(SectionType, attr_name)}")
        
        # 3. 測試 override 映射
        overrides = {
            "examples": "這是覆寫後的範例內容",
            "constraints": "這是覆寫後的限制條件"
        }
        
        print("\nOverride 映射測試:")
        for section_name, new_content in overrides.items():
            section_type = getattr(SectionType, section_name.upper(), None)
            print(f"{section_name} -> {section_type}")
            
            if section_type:
                # 檢查模板中是否有這個類型的段落
                found = any(s.section_type == section_type for s in template.sections)
                print(f"  在模板中找到: {found}")
# Run specific test groups
if __name__ == "__main__":
    # Run all tests
    pytest.main([__file__, "-v"])