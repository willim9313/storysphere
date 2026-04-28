# 前後端型別一致性：背景說明

## 問題根源

後端 Pydantic model 輸出的 JSON 欄位命名**不一致**，取決於 model 所在位置：

| 位置 | 範例 model | alias 設定 | JSON 欄位格式 |
|------|-----------|------------|--------------|
| `api/schemas/` | `TaskStatus` | `alias_generator=to_camel` | camelCase（`taskId`, `reviewStatus`） |
| `domain/` | `TensionLine`, `TensionTheme` | 無 | snake_case（`document_id`, `canonical_pole_a`） |

## 為什麼不能手寫 TypeScript type

- 欄位名稱必須與實際 JSON 完全一致，手寫容易拼錯或跟錯格式
- TypeScript 在 runtime 不會警告型別欄位不符，錯誤只會在使用端靜默出現
- 後端 model 若有異動，手寫型別不會自動同步

## 解決方案：自動產生型別

後端啟動後，在 `frontend/` 執行：

```bash
npm run gen:types
```

這會從 `http://localhost:8000/openapi.json` 抓取 schema，自動生成 `frontend/src/api/generated.ts`，欄位名稱保證與實際 JSON 一致。

產生的型別透過 `components["schemas"]` 取用，例如：

```typescript
import type { components } from "@/api/generated";
type TaskStatus = components["schemas"]["TaskStatus"];
```

## 欄位名稱快速確認

不確定某欄位是 camelCase 還是 snake_case 時：
1. 看後端 model 是否有 `alias_generator=to_camel` → 有則 camelCase
2. 或直接查 `http://localhost:8000/docs` 的 Response Schema