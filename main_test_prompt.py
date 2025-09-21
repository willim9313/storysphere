from src.prompt_templates_old.template_builder import TemplateBuilder
from src.prompt_templates_old.template_manager import MultilingualTemplateManager, TaskType
from src.prompt_templates_old.base_templates import Language

# new
from src.prompt_templates.manager import PromptManager
from src.prompt_templates.registry import TaskType, Language

class test:
    """
    測試模板構建器
    """
    def __init__(self):
        # self.template_manager = MultilingualTemplateManager()
        # self.builder = TemplateBuilder(
        #     template_manager=self.template_manager
        # )
        self.pm = PromptManager()
    def no_info_chat(self):
        """
        測試沒有資訊的聊天任務
        """
        # return self.builder.build(
        #     task_type=TaskType.CHATBOT,
        #     language=Language.CHINESE,
        #     content="你好，請問你能幫我解答一些問題嗎？"
        # )
        return self.pm.render_prompt(
            task_type=TaskType.CHATBOT,
            language=Language.CHINESE,
            content="你好，請問你能幫我解答一些問題嗎？"
        )

    def have_info_chat(self):
        """
        測試有資訊的聊天任務
        """
        # return self.builder.build(
        #     task_type=TaskType.CHATBOT,
        #     language=Language.CHINESE,
        #     content="你好，請問你能幫我解答一些問題嗎？",
        #     overrides={
        #         "ref_info": (
        #             "1993年這份專案的作者誕生了 \n"
        #             "這份專案的目的是為了讓人們更好地理解和使用文本處理技術。"
        #         )
        #     }
        # )
        return self.pm.render_prompt(
            task_type=TaskType.CHATBOT,
            language=Language.CHINESE,
            content="你好，請問你能幫我解答一些問題嗎？",
            ref_info=(
                "1993年這份專案的作者誕生了 \n"
                "這份專案的目的是為了讓人們更好地理解和使用文本處理技術。"
            )
        )

    def general_summarization(self):
        """
        測試一般摘要任務
        """
        # return self.builder.build(
        #     task_type=TaskType.GENERAL_SUMMARIZATION,
        #     language=Language.CHINESE,
        #     content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
        #     max_length=100  # 預設摘要長度是100字
        # )
        return self.pm.render_prompt(
            task_type=TaskType.SUMMARIZATION,
            language=Language.CHINESE,
            content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
            max_length=100  # 預設摘要長度是100字
        )
    
    def keyword_extraction(self):
        """
        測試關鍵詞提取任務
        有更換的範例和輸出格式
        """ 
        # return self.builder.build(
        #     task_type=TaskType.KEYWORD_EXTRACTION,
        #     language=Language.CHINESE,
        #     content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
        #     top_k=3,  # 提取3個關鍵詞
        #     overrides={
        #         "examples": (
        #             "範例：三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，"
        #             "但三隻小豬用智慧和勇氣成功地逃脫了。\n"
        #             "關鍵字: - 小豬\n- 大灰狼\n- 森林"
        #         ),
        #         "output_format": (
        #             '請以 JSON 格式輸出：\n'
        #             '{{\n'
        #             '    "result": ["關鍵字1", "關鍵字2", "關鍵字3"]\n'
        #             '}}'
        #         )
        #     }
        # )
        return self.pm.render_prompt(
            task_type=TaskType.KEYWORD_EXTRACTION,
            language=Language.CHINESE,
            content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
            top_k=3,  # 提取3個關鍵詞
            overrides={
                "examples": (
                    "範例：三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，"
                    "但三隻小豬用智慧和勇氣成功地逃脫了。\n"
                    "關鍵字: - 小豬\n- 大灰狼\n- 森林"
                ),
                "output_format": (
                    '請以 JSON 格式輸出：\n'
                    '{{\n'
                    '    "result": ["關鍵字1", "關鍵字2", "關鍵字3"]\n'
                    '}}'
                )
            }
        )
    
    def entity_extraction(self):
        """
        測試實體提取任務
        """
        # return self.builder.build(
        #     task_type=TaskType.ENTITY_EXTRACTION,
        #     language=Language.CHINESE,
        #     content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
        #     overrides={
        #         "examples": (
        #             "範例：三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，"
        #             "但三隻小豬用智慧和勇氣成功地逃脫了。\n"
        #             "實體: - 小豬\n- 大灰狼\n- 森林"
        #         ),
        #         "output_format": (
        #             '請以 JSON 格式輸出：\n'
        #             '{{\n'
        #             '    "result": ["實體1", "實體2", "實體3"]\n'
        #             '}}'
        #         )
        #     }
        # )
        return self.pm.render_prompt(
            task_type=TaskType.ENTITY_EXTRACTION,
            language=Language.CHINESE,
            content="三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，但三隻小豬用智慧和勇氣成功地逃脫了。",
            overrides={
                "examples": (
                    "範例：三隻小豬一起走進森林，遇到了一隻大灰狼。大灰狼想要吃掉他們，"
                    "但三隻小豬用智慧和勇氣成功地逃脫了。\n"
                    "實體: - 小豬\n- 大灰狼\n- 森林"
                ),
                "output_format": (
                    '請以 JSON 格式輸出：\n'
                    '{{\n'
                    '    "result": ["實體1", "實體2", "實體3"]\n'
                    '}}'
                )

if __name__ == "__main__":
    tester = test()
    # # 測試沒有資訊的聊天任務
    # print(tester.no_info_chat())
    
    # # 測試有資訊的聊天任務
    # print(tester.have_info_chat())
    
    # # 測試一般摘要任務
    # print(tester.general_summarization())
    
    # 測試關鍵詞提取任務
    print(tester.keyword_extraction())


# # 測試分離式渲染




# temp code
# template_manager = MultilingualTemplateManager()
# builder = TemplateBuilder(template_manager)

# # 獲取分離式的 prompts
# prompts = builder.build_split(
#     task_type=TaskType.CHATBOT,
#     language=Language.ENGLISH,
#     content="How can I help you today?"
# )

# # 可以分別獲取 system message 和 user message
# system_message = prompts["system_message"]
# user_message = prompts["user_message"]

# # 用於 API 調用
# messages = [
#     {"role": "system", "content": system_message},
#     {"role": "user", "content": user_message}
# ]