# PinStack 本地模型联调记录（阶段性，2026-04-10）

## 1) Step-1 模型安装与三项核验
- `ollama pull gemma3:12b`：进行中（当前约 90%，`7.4/8.1 GB`，网络速率波动 0.08~0.10 MB/s）。
- `ollama ls`：空列表。
- `/api/tags`：`models=[]`。
- `ollama show gemma3:12b`：`model not found`。
- 结论：真实模型尚不可用，`LOCAL_MODEL_MODE=real` 当前触发 preflight 后受控降级到 mock provider。

## 2) Rename 样本复跑（8 基础 + 2 边界）
- 生成时间：2026-04-09T16:46:33.060Z
- mock: configured=mock, effective=mock, provider=mock
- real: configured=real, effective=mock, provider=mock
- real preflight: [preflight] Model gemma3:12b is not available in Ollama.

| sample | mock.category | real.category | mock.short_title | real.short_title | mock.keyword | real.keyword | mock.canonical_title | real.canonical_title | mock.confidence | real.confidence | mock.latency(ms) | real.latency(ms) | fallback(real) |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|
| s1 | 开发 | 开发 | Electron 截图权限异常排查记录 | Electron 截图权限异常排查记录 | 待归类 | 待归类 | 开发_Electron 截图权限异_待归类_PinStack | 开发_Electron 截图权限异_待归类_PinStack | 0.64 | 0.64 | 0 | 0 | yes |
| s2 | 设计 | 设计 | AI 工作流重构草案 | AI 工作流重构草案 | 待归类 | 待归类 | 设计_AI 工作流重构草案_待归类_PinStack | 设计_AI 工作流重构草案_待归类_PinStack | 0.65 | 0.65 | 0 | 0 | yes |
| s3 | 设计 | 设计 | Dashboard 信息层级设计评审 | Dashboard 信息层级设计评审 | 待归类 | 待归类 | 设计_Dashboard 信息层级_待归类_PinStack | 设计_Dashboard 信息层级_待归类_PinStack | 0.6799999999999999 | 0.6799999999999999 | 0 | 0 | yes |
| s4 | 待处理 | 待处理 | 随手记：明天要做的事 | 随手记：明天要做的事 | 待归类 | 待归类 | 待处理_随手记：明天要做的事_待归类_PinStack | 待处理_随手记：明天要做的事_待归类_PinStack | 0.66 | 0.66 | 0 | 0 | yes |
| s5 | 待处理 | 待处理 | 飞书同步失败重试机制 | 飞书同步失败重试机制 | 待归类 | 待归类 | 待处理_飞书同步失败重试机制_待归类_PinStack | 待处理_飞书同步失败重试机制_待归类_PinStack | 0.69 | 0.69 | 0 | 0 | yes |
| s6 | 待处理 | 待处理 | 短视频脚本大纲 | 短视频脚本大纲 | 待归类 | 待归类 | 待处理_短视频脚本大纲_待归类_PinStack | 待处理_短视频脚本大纲_待归类_PinStack | 0.67 | 0.67 | 0 | 0 | yes |
| s7 | 待处理 | 待处理 | 增长活动复盘 | 增长活动复盘 | 待归类 | 待归类 | 待处理_增长活动复盘_待归类_PinStack | 待处理_增长活动复盘_待归类_PinStack | 0.62 | 0.62 | 0 | 0 | yes |
| s8 | AI | AI | 产品路线图：Q3 规划 | 产品路线图：Q3 规划 | 待归类 | 待归类 | AI_产品路线图：Q3 规划_待归类_PinStack | AI_产品路线图：Q3 规划_待归类_PinStack | 0.6799999999999999 | 0.6799999999999999 | 0 | 0 | yes |
| s9_long | AI | AI | 长文本边界样本 | 长文本边界样本 | 待归类 | 待归类 | AI_长文本边界样本_待归类_PinStack | AI_长文本边界样本_待归类_PinStack | 0.66 | 0.66 | 0 | 0 | yes |
| s10_ambiguous | 待处理 | 待处理 | 这个先记一下 | 这个先记一下 | 待归类 | 待归类 | 待处理_这个先记一下_待归类_PinStack | 待处理_这个先记一下_待归类_PinStack | 0.67 | 0.67 | 0 | 0 | yes |

## 3) 重复运行稳定性（2 条样本 x 3 次）
- s2
  - mock: 设计/AI 工作流重构草案/待归类/设计_AI 工作流重构草案_待归类_PinStack/0.65 | 设计/AI 工作流重构草案/待归类/设计_AI 工作流重构草案_待归类_PinStack/0.65 | 设计/AI 工作流重构草案/待归类/设计_AI 工作流重构草案_待归类_PinStack/0.65
  - real: 设计/AI 工作流重构草案/待归类/设计_AI 工作流重构草案_待归类_PinStack/0.65 | 设计/AI 工作流重构草案/待归类/设计_AI 工作流重构草案_待归类_PinStack/0.65 | 设计/AI 工作流重构草案/待归类/设计_AI 工作流重构草案_待归类_PinStack/0.65
- s9_long
  - mock: AI/长文本边界样本/待归类/AI_长文本边界样本_待归类_PinStack/0.66 | AI/长文本边界样本/待归类/AI_长文本边界样本_待归类_PinStack/0.66 | AI/长文本边界样本/待归类/AI_长文本边界样本_待归类_PinStack/0.66
  - real: AI/长文本边界样本/待归类/AI_长文本边界样本_待归类_PinStack/0.66 | AI/长文本边界样本/待归类/AI_长文本边界样本_待归类_PinStack/0.66 | AI/长文本边界样本/待归类/AI_长文本边界样本_待归类_PinStack/0.66

## 4) fallback 触发与日志
- 当前 real 全部 fallback（原因：`preflight`，模型名精确检查未通过，因为模型尚未安装完成）。
- 已确认可区分：`preflight / provider / schema / timeout`。
- 已确认调试视角区分：`configuredMode` 与 `effectiveMode`、`provider`。

## 5) summarize 并行旁路 与 dedupe 建议模式
- 单测通过：`local summary should persist source=localModel and structured lastError`。
- 单测通过：`dedupe suggestion should not override heuristic primary selection`（建议不覆盖启发式）。

## 6) 阶段建议
- 结论：暂不建议进入“真实效果评估”下一阶段。
- 准入条件：等待 `ollama pull gemma3:12b` 完成，并通过 `ollama ls / api tags / ollama show` 三项核验后，重跑本报告同一套 10 条样本。
