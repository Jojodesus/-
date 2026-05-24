# ✨ AI 提示词优化器 · Prompt Optimizer

一个**纯前端、零依赖**的 AI 提示词（Prompt）优化器。把你"随口一说"的需求，自动重写成结构化、可验收、稳定可复现的高质量提示词。

> 🎯 **设计依据**：[Datawhale Easy-Vibe 提示词工程教程](https://datawhalechina.github.io/easy-vibe/zh-cn/appendix/8-artificial-intelligence/prompt-engineering.html) · [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering) · [Anthropic Prompt Engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)

---

## ✨ 核心特性

| 能力 | 说明 |
| :--- | :--- |
| 🧪 **诊断分析** | 自动检测原始提示词是否包含 9 大要素：角色 / 任务 / 上下文 / 约束 / 输出格式 / 受众 / Few-shot / 思维链 / 自检，并打分（0-100） |
| 🗣️ **对话引导补全** | 检测到缺失关键信息（如翻译的原文、邮件的收件人）时，**通过弹窗问答让用户补充真实内容**，不再用占位符让你回头自己填 |
| ⚡ **本地快速优化** | 离线、即时、零成本。基于规则引擎按教程最佳实践重写 |
| 🤖 **AI 深度优化** | 接入任意 OpenAI 兼容 API（OpenAI / DeepSeek / 通义 / 智谱 / Moonshot / SiliconFlow / Ollama），由大模型扮演资深 Prompt Engineer 重写。**流式输出**、**实时增量呈现** |
| 📈 **AI 质量评分** | **LLM-as-judge** 6 维结构化打分 + **OpenAI logprobs 概率加权校准**（受 [G-Eval](https://arxiv.org/abs/2303.16634) 启发）。原始 vs 优化后并排对比柱状图 |
| 🎭 **多种风格** | 通用 Markdown / Claude XML 标签 / OpenAI 段落 / 推理模型简洁风（o1、R1） |
| 🌍 **多场景模板** | 内置 8 大场景 + 8 个一键载入模板（总结 / 代码 Review / 翻译 / 抽取 / 面试 / 计划先行 / 澄清 / 注入防御） |
| 🛡 **指令注入防御** | 一键开启 prompt-injection 防御段落，自动用分隔符隔离用户素材 |
| 🌗 **明暗主题** | 自适应 + 一键切换 |
| 🔒 **隐私优先** | 所有处理都在浏览器本地完成。API Key 仅保存在 `localStorage`，**绝不上传任何服务器** |

---

## 🚀 快速开始

### 方式一：直接打开（最快）

```bash
git clone https://github.com/Jojodesus/-.git prompt-optimizer
cd prompt-optimizer
# 用任意静态服务器打开（推荐，因为浏览器对 file:// 的 ES 模块有限制）
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

或者用 VSCode 的 Live Server / `npx serve` / `npx http-server` 等。

### 方式二：部署到 GitHub Pages

把仓库设为 Pages 即可：Settings → Pages → Source: `main` / `root` → 保存。

### 方式三：扔到任何静态托管

Vercel / Netlify / Cloudflare Pages：直接拖拽文件夹即可。无需 build。

---

## 📖 使用流程

1. **粘贴你的原始提示词**（例如："帮我写一段咖啡店开业的文案"）
2. 选择**场景**（通用 / 写作 / 代码 / 翻译 / Agent ……）
3. 选择**目标模型风格**（通用 / Claude XML / OpenAI / 推理模型）
4. 勾选可选增强：Few-shot 示例 / 思维链 / 自检 / 注入防御
5. 点击 **⚡ 本地快速优化**（即时） 或 **🤖 AI 深度优化**（更精细）
6. 查看右侧的：
   - 🎯 **优化后的提示词**（一键复制 / 下载）
   - 📊 **诊断报告**（每个要素是否齐全 + 总分）
   - 🛠 **改动摘要**（解释了为什么这么改）

> 💡 快捷键：在输入框按 `Ctrl/⌘ + Enter` 直接触发本地优化。

---

## 🤖 AI 深度优化配置

点击右上角 **⚙️ 设置**，填入：

| 字段 | 示例 |
| :--- | :--- |
| API Base URL | `https://api.openai.com/v1` / `https://api.deepseek.com/v1` |
| API Key      | `sk-...` |
| 模型         | `gpt-4o-mini` / `deepseek-chat` / `qwen-plus` ... |
| Temperature  | 推荐 `0.2 ~ 0.4`（重写任务需要稳定，不需要发散） |

设置面板提供**一键预设**：OpenAI / DeepSeek / 通义 / SiliconFlow / Moonshot / Ollama（本地）。

> 🔐 API Key 仅保存在你浏览器的 `localStorage`，本工具没有任何后端，不会上传到服务器。

---

## 🧠 优化引擎做了什么？

针对每段提示词，工具会按以下流程重写（参考 Datawhale 教程的"提示词 3 + N 要素"）：

```
[角色 Role]            ← 没指定？补充场景对应的资深角色
   ↓
[任务 Task]            ← 用清晰动词重述任务
   ↓
[输入材料 Context]      ← 用 ``` 或 """ 包裹，分离指令与素材
   ↓
[受众 Audience]        ← 调节难度与口吻
   ↓
[约束 Constraints]     ← 长度 / 要点数 / 必须包含 / 必须避免
   ↓
[输出格式 Format]       ← Markdown / JSON / 表格 / 代码块
   ↓
[Few-shot Examples]   ← 可选：2 个范例锁定风格
   ↓
[Plan-first 计划]     ← 可选：复杂任务先列清单再执行
   ↓
[Self-Check 自检]      ← 输出前检查约束、信息不足先反问
   ↓
[Security 安全规则]    ← 可选：抵御指令注入
```

针对**推理模型**（OpenAI o1、DeepSeek R1 等），引擎会**自动省略 CoT 引导**，避免干扰其内置推理（这一点也是 Anthropic 与 OpenAI 官方明确建议的）。

---

## 📂 项目结构

```
.
├── index.html          # 入口
├── styles.css          # 样式（明/暗主题）
├── js/
│   ├── app.js          # UI 控制器
│   ├── optimizer.js    # 规则引擎：结构化重写
│   ├── diagnoser.js    # 诊断引擎：要素识别 + 评分
│   ├── ai-optimizer.js # AI 深度优化：OpenAI 兼容 API（流式）
│   ├── evaluator.js    # AI 质量评分：LLM-as-judge + Logprobs 校准
│   └── templates.js    # 场景定义 + 一键载入模板
└── README.md
```

---

## 📈 关于 AI 质量评分

### 工作原理

每次"运行 AI 评分"会对 **原始** 和 **优化后** 两个版本各发起 1-2 次 API 调用：

1. **结构化打分（LLM-as-judge）** — 1 次调用 / 每个版本
   - 让 AI 在 6 个维度上给出 1-9 分 + 简短理由：
     - **任务清晰度**（权重 20%）：动词明确、范围清楚
     - **具体可验收**（权重 18%）：约束量化、可检查
     - **结构与组织**（权重 15%）：分段/标题/列表
     - **上下文/素材**（权重 12%）：背景充分、与指令分离
     - **输出格式**（权重 15%）：JSON/Markdown/表格 明确
     - **鲁棒性与安全**（权重 20%）：自检/澄清/注入防御
   - 加权平均 → JSON 总分

2. **Logprobs 概率加权校准**（可选，自动尝试）— 1 次调用 / 每个版本
   - 强制模型只输出一位数字（1-9），开启 `logprobs: true` + `top_logprobs: 10`
   - 计算概率加权平均：`score = Σ(digit_i × P(digit_i)) / Σ P(digit_i)`
   - 这种方式比单点 argmax 更平滑、更稳定（受 [G-Eval](https://arxiv.org/abs/2303.16634) 启发）
   - 如果 API 不支持 logprobs（部分代理或厂商），自动降级到 argmax 或仅显示 JSON 加权分

### 兼容性

| 服务商 | JSON 评分 | Logprobs 校准 |
| :--- | :---: | :---: |
| OpenAI                 | ✅ | ✅ |
| DeepSeek               | ✅ | ✅ |
| Together / Groq        | ✅ | ✅ |
| Moonshot / SiliconFlow | ✅ | ⚠️ 视模型 |
| 通义 / 智谱             | ✅ | ⚠️ 视版本 |
| Ollama (本地)           | ✅ | ⚠️ 视版本 |
| Claude (Anthropic 原生) | ✅ via 代理 | ❌（Anthropic 不返回 logprobs） |

> 当 Logprobs 校准失败时，会自动回退到 JSON 加权分，并在卡片下方标注 "⚠️ 未校准"。

---

## 🛠 二次开发

- **新增场景**：在 `js/templates.js` 的 `SCENARIOS` 中追加一项即可
- **新增一键模板**：在 `QUICK_TEMPLATES` 中添加
- **接入新服务商**：在 `js/ai-optimizer.js` 的 `PROVIDER_PRESETS` 中追加
- **调整诊断规则**：修改 `js/diagnoser.js` 的 `PATTERNS` 与权重

---

## 📚 参考资料

- [Datawhale Easy-Vibe · 提示词工程章节](https://datawhalechina.github.io/easy-vibe/zh-cn/appendix/8-artificial-intelligence/prompt-engineering.html)
- [OpenAI · Prompt engineering best practices](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic · Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Anthropic · Use XML tags to structure your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Datawhale · 面向开发者的 LLM 入门课程](https://github.com/datawhalechina/prompt-engineering-for-developers)

---

## 📜 License

MIT
