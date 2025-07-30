from src.templates.template_builder import TemplateBuilder
from src.templates.template_manager import MultilingualTemplateManager, TaskType
from src.templates.base_templates import Language

a = TemplateBuilder(
    template_manager=MultilingualTemplateManager()
)

b = a.build(
    task_type=TaskType.CHATBOT,
    language=Language.CHINESE,
    content="你好，請問你能幫我解答一些問題嗎？"
)

print(b)
print("\n" + "="*50 + "\n")

b = a.build(
    task_type=TaskType.CHATBOT,
    language=Language.ENGLISH,
    content="Hello, can you help me answer some questions?"
)

print(b)
print("\n" + "="*50 + "\n")

# b = a.build(
#     task_type=TaskType.GENERAL_SUMMARIZATION,
#     language=Language.CHINESE,
#     content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
#     max_length=50
# )

# print(b)
# print("\n" + "="*50 + "\n")


# b = a.build(
#     task_type=TaskType.KEYWORD_EXTRACTION,
#     language=Language.CHINESE,
#     content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
#     top_k=3,
#     ref_info="可選的參考資訊，例如：豬、狼、森林",
#     examples="範例：\n- 小豬\n- 大灰狼\n- 森林"
# )

# print(b)
# print("\n" + "="*50 + "\n")