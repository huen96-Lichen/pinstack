# PinStack 本地模型联调记录（2026-04-10）

## 1. 环境与前置
- `LOCAL_MODEL_ENABLED=true`
- `LOCAL_MODEL_MODE=real`
- `LOCAL_MODEL_NAME=gemma3:12b`
- `OLLAMA_BASE_URL=http://localhost:11434`

Ollama 状态：
- `/api/version` 返回：`0.20.4`
- `/api/tags` 返回：`{"models":[]}`
- `ollama show gemma3:12b` 返回：`model not found`

结论：
- 当前机器 Ollama 服务可达，但目标模型 `gemma3:12b` 尚未安装。
- `real` 模式初始化触发 preflight 失败，服务进入受控降级（effective provider=`mock`）。

## 2. Step-1：renameNoteWithLocalModel 真实模式调用验证

验证方式：在 `LOCAL_MODEL_MODE=real` 下调用 `renameNoteWithLocalModel` 8 条样本。

结果摘要：
- 配置模式：`real`
- 有效执行模式：`mock`（preflight 失败后降级）
- preflight 错误：`[preflight] Model gemma3:12b is not available in Ollama.`

样本结果（节选）：
- s1（开发修复类）→ `category=开发`，`canonical_title=开发_修复 Electron 截图_待归类_PinStack`
- s2（AI 工作流类）→ `category=AI`，`canonical_title=AI_整理 AI 工作流：Prom_待归类_PinStack`
- s3（设计评审类）→ `category=设计`
- s4（随手记录类）→ `category=待处理`

观察：
- 由于模型未安装，本轮无法得到“真实 gemma3:12b 输出”，仅验证了 real 模式入口与降级链路。
- 结果稳定性可测（同输入稳定），但当前值来自 mock provider。

## 3. Step-2：5~10 条样本重命名稳定性检查

已检查 8 条样本的：
- `category`
- `short_title`
- `keyword`
- `canonical_title`

结论：
- 在当前降级状态下，输出结构稳定、字段完整。
- `keyword` 偏保守，较多落到默认 `待归类`，后续真实模型阶段可调 prompt 强化关键词提取。

## 4. Step-3：summarizeForKnowledgeBase 并行旁路验证（不阻塞主链路）

验证方式：
- 注入一个 `summarizeForKnowledgeBase` 延迟 1500ms 的本地模型服务。
- 触发 favorite 文本同步，观测主链路（bitable/document/linkback）与 summary 写入时序。

结果：
- 主链路完成：`13ms`
- summary 就绪：`1512ms`
- 主链路状态：`bitable=synced, document=synced, linkback=synced`
- `localModel.summary.source=localModel`

结论：
- summary 为并行旁路写入，不阻塞主链路。

## 5. Step-4：dedupeSuggestion 质量验证（建议模式）

验证方式：5 组 A/B 输入调用 dedupe；同时确认“启发式主记录选择仍为最终依据”。

结果摘要：
- d1（同 URL 高重合）→ `is_duplicate=true, reason=matched-original-url`
- d4（高文本重合）→ `is_duplicate=true, reason=high-text-overlap`
- d2/d3/d5（低相关）→ `is_duplicate=false, reason=fallback: keep heuristic decision`

建议模式验证：
- 即使本地建议偏向某个主记录（例如 `primary_choice=B`），最终主记录仍按启发式规则确定。

## 6. Fallback 日志与原因区分检查

当前已可区分并记录：
- preflight：`[preflight] ...`
- provider：`[provider] ...`
- schema：`[schema] ...`
- timeout：`[timeout] ...`

日志示例：
- `[localModel.fallback] { reason: 'preflight' ... }`
- `[localModel.fallback] { reason: 'provider' ... }`
- `[localModel.fallback] { reason: 'schema' ... }`
- `[localModel.fallback] { reason: 'timeout' ... }`

## 7. mock / real 调试视角区分检查

当前可明确区分：
- `configuredMode`: 配置模式（mock 或 real）
- `effectiveMode`: 实际执行模式（real 或降级后的 mock）
- `provider`: 当前实际 provider（mock 或 ollama）
- `lastError.provider`: 出错来源 provider

示例：
- mock 模式：`configuredMode=mock, effectiveMode=mock, provider=mock`
- real 但 preflight 失败：`configuredMode=real, effectiveMode=mock, provider=mock, lastError.provider=ollama`

## 8. 成功样本 / 失败样本

成功样本：
- real 模式入口可执行并触发 preflight。
- rename 8 条样本均返回合法结构（在降级为 mock 的情况下）。
- summary 并行旁路写入完成且不阻塞主链路。
- dedupe 建议可写入且不覆盖启发式。

失败样本：
- real 模式真实模型调用失败：`gemma3:12b` 未安装，preflight 失败后降级。

## 9. prompt / schema 微调建议

1. rename prompt
- 增加 `keyword` 产出约束：要求优先输出具体业务词（例如“权限修复”“信息架构”），减少默认词命中。

2. rename schema
- `short_title` 目前按截断处理，建议增加“避免截断到英文半词/符号尾巴”的后处理规则。

3. dedupe prompt
- 增加“当 `primary_choice` 给出 B 时，必须附加原因模板（URL/时间/信息完整度）”以便后续评估可解释性。

4. summary prompt
- 要求输出 `summary` 时优先保留结论句 + 1 个行动项，提升知识库可用度。

5. 真实模型联调前置
- 下一步先完成 `ollama pull gemma3:12b`，再重复本记录 Step-1/2，替换掉当前降级样本。
