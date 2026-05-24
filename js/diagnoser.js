// =============================================================
// diagnoser.js
// 基于 Datawhale + OpenAI + Claude 提示词工程教程的诊断引擎
// 检查原始提示词是否包含 6 大要素 + Few-shot + CoT + 自检
// =============================================================

/**
 * 提示词关键要素定义（基于教程总结）
 * - role:        角色 / 身份
 * - task:        明确任务动词
 * - context:     背景 / 输入材料
 * - constraint:  长度、风格、必须包含/避免
 * - format:      输出格式
 * - audience:    目标受众
 * - example:     Few-shot 示例
 * - cot:         思维链 / 先列计划
 * - selfcheck:   自检 / 允许澄清
 */

const PATTERNS = {
  role: [
    /你是.{1,30}/,
    /扮演|担任|作为(?:一名|一个|一位)/,
    /你的身份是|你的角色是/,
    /\bact as\b/i, /\byou are\b/i, /\brole\s*[:：]/i,
    /<role>/i, /## *角色/, /## *Role/i
  ],
  task: [
    /帮我|请你|请你?(?:写|生成|总结|翻译|分析|解释|提取|改|润色|优化|对比|评估|推荐|设计|计划|规划|拆解|输出)/,
    /\b(write|generate|summari[sz]e|translate|analy[sz]e|explain|extract|rewrite|improve|optimi[sz]e|compare|evaluate|recommend|design|plan)\b/i,
    /^任务|## *任务|## *Task/im
  ],
  context: [
    /以下|下面|如下|根据(?:以下|下列|下面)|参考(?:以下|下列|下面)/,
    /背景[:：]|上下文[:：]|材料[:：]|输入[:：]/,
    /```|"""|---/,
    /\b(context|background|input|reference)\s*[:：]/i,
    /<context>|<input>|<text>/i
  ],
  constraint: [
    /不超过|至少|最多|不少于|必须|不要|避免|禁止|限制|要求/,
    /\d+\s*(?:字|词|句|个要点|条|行|words|chars|bullets|points)/i,
    /\b(must|should not|don'?t|avoid|limit|at least|at most|no more than)\b/i,
    /## *(?:约束|要求|规则)/,
    /## *(?:Constraints?|Requirements?|Rules?)/i
  ],
  format: [
    /(?:输出|返回|生成|按).{0,10}(?:JSON|json|表格|Markdown|markdown|列表|代码块|YAML|yaml|XML|xml|CSV|csv)/,
    /格式[:：]|按.{1,8}格式|以.{1,8}格式/,
    /\b(?:output|return|format|respond)\s+(?:in|as)\s+(JSON|markdown|table|list|YAML|XML|CSV|code)\b/i,
    /## *(?:输出格式|Output format|Format)/i,
    /\{[\s\S]*"\w+"\s*:[\s\S]*\}/  // 包含 JSON 模板
  ],
  audience: [
    /给.{1,10}(?:看|用|阅读)|面向|针对|读者是|受众是|写给/,
    /\b(?:audience|for\s+(?:the|a)?\s*(?:user|reader|engineer|child|beginner|expert))\b/i
  ],
  example: [
    /例如[:：]|示例[:：]|举例[:：]|参考示例|Few-shot|few-shot/i,
    /输入[:：][\s\S]*?输出[:：]/,
    /\b(example|for instance|e\.?g\.?)\s*[:：]/i,
    /## *(?:示例|Examples?)/i
  ],
  cot: [
    /一步.?一步|逐步|分步|先.{1,8}再|step by step|step-by-step/i,
    /先(?:列|输出|给出)(?:计划|大纲|清单|步骤)/,
    /思维链|思考过程|reasoning|chain[\s-]?of[\s-]?thought/i,
    /## *(?:计划|步骤|Plan|Steps?)/i
  ],
  selfcheck: [
    /自检|自查|检查(?:一下|是否)|确认/,
    /如果.{1,20}不(?:够|足|清楚|明确).{0,20}(?:问|确认|澄清)/,
    /\b(?:self[-\s]?check|verify|confirm|clarif|ask\s+(?:me|first))\b/i
  ]
};

const ELEMENT_META = {
  role:       { label: '角色 (Role)',         weight: 12, advice: '建议指定身份，例如"你是资深产品经理"。角色决定口吻与专业深度。' },
  task:       { label: '任务 (Task)',         weight: 18, advice: '使用明确动词描述任务："总结/生成/翻译/分析"，避免"帮我搞一下"。' },
  context:    { label: '上下文/材料 (Context)', weight: 14, advice: '把要处理的材料用 ``` 或 """ 包起来，避免被当作指令。' },
  constraint: { label: '约束 (Constraints)',   weight: 14, advice: '加入长度、要点数、必须包含/避免等可验收的约束。' },
  format:     { label: '输出格式 (Format)',    weight: 14, advice: '指定 Markdown / JSON / 表格 等结构化格式，便于直接使用。' },
  audience:   { label: '受众 (Audience)',      weight: 6,  advice: '说明目标读者（老板/同事/新手），调节难度与语气。' },
  example:    { label: 'Few-shot 示例',        weight: 8,  advice: '给 1-3 个"输入→输出"示例，比形容词描述风格更有效。' },
  cot:        { label: '思维链 / 先列计划',     weight: 8,  advice: '复杂任务先要求"列出计划再执行"，减少跑题。' },
  selfcheck:  { label: '自检 / 澄清',          weight: 6,  advice: '允许 AI 反问：信息不足时先列出 3 个澄清问题。' }
};

/**
 * 诊断一段提示词
 * @param {string} prompt
 * @returns {{score:number, items:Array<{key,label,present,advice,severity}>, length:number}}
 */
export function diagnose(prompt) {
  const text = (prompt || '').trim();
  const length = text.length;

  const items = [];
  let earned = 0;
  let total = 0;

  for (const [key, meta] of Object.entries(ELEMENT_META)) {
    const patterns = PATTERNS[key] || [];
    const present = patterns.some(re => re.test(text));
    total += meta.weight;
    if (present) earned += meta.weight;
    items.push({
      key,
      label: meta.label,
      present,
      advice: meta.advice,
      severity: present ? 'ok' : (meta.weight >= 12 ? 'miss' : 'warn')
    });
  }

  // 长度兜底惩罚：太短(< 15 字符)直接限制分数
  let score = total === 0 ? 0 : Math.round((earned / total) * 100);
  if (length < 15) score = Math.min(score, 25);
  if (length < 8)  score = Math.min(score, 10);

  return { score, items, length };
}

export const ELEMENTS = ELEMENT_META;
