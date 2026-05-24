// =============================================================
// clarifier.js
// 智能追问：检测原始提示词中"缺失但对任务完成有重要性"的要素，
// 通过对话引导用户补全，而不是自行用占位符填充。
// =============================================================
//
// 设计原则：
// 1. 只问"任务依赖"的关键信息（priority=1）和"显著影响质量"的重要信息（priority=2）
// 2. 不问可选/通用增强项（如 Few-shot / CoT），那些用占位符即可
// 3. 一次最多问 4 个问题，按 priority 排序
// 4. 必填项必须有答案才能继续；可选项可跳过

/**
 * 通用问题（任何场景都可能触发）
 */
const GENERAL_QUESTIONS = [
  {
    key: 'taskDetails',
    concept: 'task-clarity',
    label: '任务的具体内容',
    hint: '原始描述太简短，可能不足以让 AI 理解你想要什么',
    required: false,
    priority: 1,
    type: 'textarea',
    placeholder: '请用 1-3 句话详细说明你想要 AI 做什么...',
    applyTo: 'task',
    detect: ({ prompt }) => prompt.trim().length > 0 && prompt.trim().length < 15
  },
  {
    key: 'sourceMaterial',
    concept: 'material',
    label: '需要 AI 处理的材料',
    hint: '检测到任务可能需要素材（文本/数据/代码），但你没有提供',
    required: false,
    priority: 1,
    type: 'textarea',
    placeholder: '把要处理的原文 / 代码 / 数据粘贴在这里...',
    applyTo: 'context',
    detect: ({ prompt, scenario }) => {
      // 任务暗示需要材料
      const needsMaterial = /(?:总结|概括|分析|翻译|改写|润色|提取|抽取|review|审查|找出|对比|评估|审阅)/i.test(prompt);
      if (!needsMaterial) return false;
      // 已经包含材料块（``` 或 """ 或 <<<）
      const hasMaterialBlock = /```[\s\S]{10,}```|"""[\s\S]{10,}"""|<<<[\s\S]{10,}>>>/.test(prompt);
      return !hasMaterialBlock;
    }
  }
];

/**
 * 场景特定问题
 */
const SCENARIO_QUESTIONS = {
  general: [],

  writing: [
    {
      key: 'topic',
      concept: 'task-clarity',
      label: '具体主题或对象',
      hint: '写作任务需要明确的主题，不然 AI 只能瞎猜',
      required: false,
      priority: 1,
      type: 'text',
      placeholder: '例如：手冲咖啡的开业宣传 / 新款无线耳机的卖点',
      applyTo: 'task',
      detect: ({ prompt }) => prompt.length < 30
    },
    {
      key: 'platform',
      label: '发布平台 / 渠道',
      hint: '不同平台的语气和长度差异很大',
      required: false,
      priority: 2,
      type: 'datalist',
      options: ['微信公众号', '小红书', '抖音/视频号文案', 'Twitter / X', 'LinkedIn', '电商详情页', '邮件正文', 'PPT 大纲'],
      placeholder: '选择或输入...',
      applyTo: 'constraint',
      detect: ({ prompt }) => !/公众号|小红书|抖音|视频号|twitter|linkedin|微博|知乎|发布到|发在|发到|登在/i.test(prompt)
    },
    {
      key: 'targetLength',
      label: '期望长度',
      hint: '指定字数让结果可控',
      required: false,
      priority: 2,
      type: 'datalist',
      options: ['极短 (≤50字，金句风)', '短 (50-200字)', '中等 (200-500字)', '长文 (>500字)'],
      placeholder: '选择或输入...',
      applyTo: 'constraint',
      detect: ({ prompt }) => !/\d+\s*字|不超过|至少|篇幅|短一点|长一点/.test(prompt)
    }
  ],

  code: [
    {
      key: 'language',
      label: '编程语言 / 技术栈',
      hint: '不同语言的实现差异很大',
      required: false,
      priority: 1,
      type: 'datalist',
      options: ['Python', 'JavaScript', 'TypeScript', 'TypeScript + React', 'Go', 'Rust', 'Java', 'C++', 'C#', 'Kotlin', 'Swift'],
      placeholder: '选择或输入...',
      applyTo: 'task',
      detect: ({ prompt }) => !/\b(?:python|java(?:script)?|typescript|tsx?|go(?:lang)?|rust|c\+\+|c#|\.net|kotlin|swift|php|ruby|scala|node)\b/i.test(prompt)
    },
    {
      key: 'sourceCode',
      concept: 'material',
      label: '需要处理的现有代码',
      hint: '若是 review / 重构 / 调试，需要现有代码',
      required: false,
      priority: 1,
      type: 'textarea',
      placeholder: '把要处理的代码粘贴在这里...',
      applyTo: 'context',
      detect: ({ prompt }) => /(?:review|审查|重构|调试|debug|修(?:复|改)|fix|优化|改进|找.*?bug)/i.test(prompt) && !/```[\s\S]{20,}```/.test(prompt)
    },
    {
      key: 'requirements',
      concept: 'task-clarity',
      label: '功能需求 / 输入输出',
      hint: '描述清楚要解决的问题，AI 才能精准实现',
      required: false,
      priority: 2,
      type: 'textarea',
      placeholder: '例如：实现一个限流器，输入: rps + key，输出: 是否允许通过',
      applyTo: 'task',
      detect: ({ prompt }) => prompt.length < 40
    }
  ],

  analysis: [
    {
      key: 'data',
      concept: 'material',
      label: '要分析的数据 / 资料',
      hint: '分析任务必须有具体的数据来源',
      required: true,
      priority: 1,
      type: 'textarea',
      placeholder: '把要分析的数据 / 资料 / 原文粘贴在这里...',
      applyTo: 'context',
      detect: ({ prompt }) => !/```[\s\S]{20,}```|"""[\s\S]{20,}"""/.test(prompt)
    },
    {
      key: 'analysisGoal',
      concept: 'task-clarity',
      label: '分析目标',
      hint: '想从这份资料中得到什么洞察？',
      required: false,
      priority: 2,
      type: 'text',
      placeholder: '例如：找出用户最关心的 3 个问题 / 评估市场规模',
      applyTo: 'task',
      detect: ({ prompt }) => prompt.length < 50
    }
  ],

  translate: [
    {
      key: 'sourceText',
      concept: 'material',
      label: '要翻译的原文',
      hint: '翻译任务必须有原文',
      required: true,
      priority: 1,
      type: 'textarea',
      placeholder: '粘贴你想翻译的文本...',
      applyTo: 'context',
      detect: ({ prompt }) => !/```[\s\S]{10,}```|"""[\s\S]{10,}"""/.test(prompt)
    },
    {
      key: 'targetLang',
      label: '目标语言',
      hint: '没有指定要翻译成什么语言',
      required: true,
      priority: 1,
      type: 'datalist',
      options: ['英文', '中文', '日文', '韩文', '法文', '德文', '西班牙文', '意大利文', '俄文', '繁体中文'],
      placeholder: '选择或输入...',
      applyTo: 'task',
      detect: ({ prompt }) => !/翻译成|译成|翻成|译为|转成|to\s+(?:english|chinese|japanese|korean|french|german|spanish)/i.test(prompt)
    },
    {
      key: 'tone',
      label: '语气 / 文体',
      hint: '保留原文风格还是调整？',
      required: false,
      priority: 2,
      type: 'datalist',
      options: ['正式 / 商务', '口语 / 日常', '技术文档', '学术论文', '营销文案', '保留原文风格'],
      placeholder: '选择或输入...',
      applyTo: 'constraint',
      detect: ({ prompt }) => !/正式|口语|技术|学术|营销|商务|严肃|轻松|文学|新闻|风格保留/i.test(prompt)
    }
  ],

  brainstorm: [
    {
      key: 'topic',
      concept: 'task-clarity',
      label: '头脑风暴的主题',
      hint: '具体的方向才能发散',
      required: false,
      priority: 1,
      type: 'text',
      placeholder: '例如：周末团建活动方案 / 新品命名',
      applyTo: 'task',
      detect: ({ prompt }) => prompt.length < 30
    },
    {
      key: 'constraints',
      label: '已知约束（预算 / 人数 / 时间 等）',
      hint: '排除明显不合适的方向',
      required: false,
      priority: 2,
      type: 'textarea',
      placeholder: '例如：预算 5000 元、20 人、半天、有素食者',
      applyTo: 'constraint',
      detect: ({ prompt }) => !/预算|人数|多少人|时间|几小时|几天|限制/.test(prompt)
    }
  ],

  email: [
    {
      key: 'recipient',
      label: '收件人 / 关系',
      hint: '关系决定语气',
      required: true,
      priority: 1,
      type: 'datalist',
      options: ['客户', '老板', '同事', '跨部门同事', '下属', '陌生联系人', '合作伙伴', '供应商', '应聘者'],
      placeholder: '选择或输入...',
      applyTo: 'audience'
    },
    {
      key: 'purpose',
      concept: 'task-clarity',
      label: '邮件目的',
      hint: '一句话说清楚你想达成什么',
      required: true,
      priority: 1,
      type: 'text',
      placeholder: '例如：请求延期一周 / 同步项目进度 / 邀请下周开会',
      applyTo: 'task'
    },
    {
      key: 'keyInfo',
      label: '必须包含的关键信息',
      hint: '如时间、金额、附件、链接等',
      required: false,
      priority: 2,
      type: 'textarea',
      placeholder: '一行一个关键信息...',
      applyTo: 'constraint'
    }
  ],

  learning: [
    {
      key: 'concept',
      concept: 'task-clarity',
      label: '要讲解的概念',
      hint: '具体的概念名称',
      required: true,
      priority: 1,
      type: 'text',
      placeholder: '例如：闭包 / 红黑树 / 期权定价 / 反向传播',
      applyTo: 'task',
      detect: ({ prompt }) => prompt.length < 30
    },
    {
      key: 'background',
      label: '你的背景 / 当前水平',
      hint: '帮 AI 调节难度',
      required: false,
      priority: 1,
      type: 'datalist',
      options: ['完全零基础（用类比和故事讲）', '相关领域新手（基础概念懂）', '有一定经验（直接讲深一点）', '同行专家（高密度技术讨论）'],
      placeholder: '选择或输入...',
      applyTo: 'audience'
    }
  ],

  agent: [
    {
      key: 'agentPurpose',
      concept: 'task-clarity',
      label: 'Agent 的用途',
      hint: '这个 Agent 要做什么？',
      required: true,
      priority: 1,
      type: 'text',
      placeholder: '例如：客服问答 / 代码生成 / 文档检索 / 工单分类',
      applyTo: 'task',
      detect: ({ prompt }) => prompt.length < 40
    },
    {
      key: 'sampleInput',
      label: '一个典型的用户输入示例',
      hint: '帮 Agent 校准对输入格式的预期',
      required: false,
      priority: 2,
      type: 'textarea',
      placeholder: '例如：用户问"我的订单 #12345 什么时候发货？"',
      applyTo: 'context'
    }
  ]
};

/**
 * 检测原始 prompt 中需要追问哪些问题
 *
 * 关键策略：
 *  1. 概念去重 (concept dedup)：场景特定问题会顶替同 concept 的通用问题
 *     例如 translate.sourceText 会替代 general.sourceMaterial
 *  2. 级联规则 (cascade)：如果没有任何 priority=1 的问题需要问，
 *     就不再追问 priority=2 的"建议级"问题（说明用户的 prompt 已较完整）
 *  3. 按 required → priority 排序，最多 4 个
 *
 * @param {{prompt:string, scenario:string}} params
 * @returns {Array<Question>}
 */
export function getClarificationQuestions({ prompt, scenario }) {
  const ctx = { prompt, scenario };

  // 收集候选：先场景特定，再通用（这样去重时场景特定优先保留）
  const candidates = [];
  for (const q of (SCENARIO_QUESTIONS[scenario] || [])) {
    if (!q.detect || q.detect(ctx)) candidates.push(q);
  }
  for (const q of GENERAL_QUESTIONS) {
    if (!q.detect || q.detect(ctx)) candidates.push(q);
  }

  // 1) concept 去重：第一次出现的保留，之后同 concept 的丢弃
  const seenConcepts = new Set();
  let deduped = [];
  for (const q of candidates) {
    if (q.concept) {
      if (seenConcepts.has(q.concept)) continue;
      seenConcepts.add(q.concept);
    }
    deduped.push(q);
  }

  // 2) 级联规则：没有 priority=1 → 跳过 priority=2
  const hasP1 = deduped.some(q => q.priority === 1);
  if (!hasP1) {
    deduped = deduped.filter(q => q.priority === 1);
  }

  // 3) 排序：必填优先 → priority 数字小优先
  deduped.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return (a.priority || 99) - (b.priority || 99);
  });

  // 4) 最多 4 个
  return deduped.slice(0, 4);
}

/**
 * 把用户的回答按 applyTo 分配到不同 sections
 * @param {Object} answers          { key1: 'value', key2: 'value' }
 * @param {Array<Question>} questions  本次实际问的问题
 * @returns {{task:Array, context:Array, constraint:Array, audience:Array, format:Array}}
 *          每个 bucket 是 [{key, label, value}, ...]
 */
export function distributeAnswers(answers, questions) {
  const buckets = { task: [], context: [], constraint: [], audience: [], format: [] };
  if (!answers || !questions) return buckets;

  for (const q of questions) {
    const raw = answers[q.key];
    if (raw == null) continue;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (!value) continue;
    const target = q.applyTo || 'task';
    if (!buckets[target]) buckets[target] = [];
    buckets[target].push({ key: q.key, label: q.label, value });
  }
  return buckets;
}

/**
 * 给一份"需要追问的问题列表"生成简短摘要（用于改动说明）
 */
export function summarizeAnsweredQuestions(answers, questions) {
  if (!answers || !questions) return [];
  return questions
    .filter(q => {
      const v = answers[q.key];
      return v != null && (typeof v !== 'string' || v.trim());
    })
    .map(q => q.label);
}
