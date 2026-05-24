// =============================================================
// app.js — UI 控制器
// =============================================================

import { optimize } from './optimizer.js';
import { aiOptimize, PROVIDER_PRESETS } from './ai-optimizer.js';
import { QUICK_TEMPLATES } from './templates.js';
import { diagnose } from './diagnoser.js';
import { evaluatePair } from './evaluator.js';
import { getClarificationQuestions } from './clarifier.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// === DOM ===
const els = {
  input:        $('#input-prompt'),
  scenario:     $('#select-scenario'),
  modelStyle:   $('#select-model-style'),
  language:     $('#select-language'),
  optFewshot:   $('#opt-fewshot'),
  optCot:       $('#opt-cot'),
  optSelfcheck: $('#opt-selfcheck'),
  optSecurity:  $('#opt-security'),

  btnOptimize:    $('#btn-optimize'),
  btnAiOptimize:  $('#btn-ai-optimize'),
  btnClear:       $('#btn-clear'),
  btnSample:      $('#btn-sample'),
  btnCopy:        $('#btn-copy'),
  btnDownload:    $('#btn-download'),

  output:       $('#output-prompt'),
  diagList:     $('#diag-list'),
  scoreCircle:  $('#score-circle'),
  scoreValue:   $('#score-value'),
  changesList:  $('#changes-list'),

  modalSettings:  $('#modal-settings'),
  modalTemplates: $('#modal-templates'),
  btnSettings:    $('#btn-settings'),
  btnTemplates:   $('#btn-templates'),
  btnTheme:       $('#btn-theme'),
  btnSaveSettings:$('#btn-save-settings'),
  cfgBase:  $('#cfg-base'),
  cfgKey:   $('#cfg-key'),
  cfgModel: $('#cfg-model'),
  cfgTemp:  $('#cfg-temp'),
  templateGrid: $('#template-grid'),
  toast: $('#toast'),

  // Evaluation
  btnEvaluate:   $('#btn-evaluate'),
  evalStatus:    $('#eval-status'),
  evalEmpty:     $('#eval-empty'),
  evalResults:   $('#eval-results'),
  origOverall:   $('#orig-overall'),
  origMeta:      $('#orig-meta'),
  optOverall:    $('#opt-overall'),
  optMeta:       $('#opt-meta'),
  deltaValue:    $('#delta-value'),
  deltaMeta:     $('#delta-meta'),
  evalDimensions:$('#eval-dimensions'),
  origComment:   $('#orig-comment'),
  optComment:    $('#opt-comment'),

  // Clarification
  cfgClarifyEnabled: $('#cfg-clarify-enabled'),
  modalClarify:     $('#modal-clarify'),
  clarifyCount:     $('#clarify-count'),
  clarifyQuestions: $('#clarify-questions'),
  clarifySkipFuture:$('#clarify-skip-future'),
  btnClarifySkip:   $('#btn-clarify-skip'),
  btnClarifyContinue:$('#btn-clarify-continue')
};

// === 状态 ===
let lastOutput = '';
let sessionSkipClarify = false;     // 用户在本次会话点了"不再追问"
let pendingClarifyResolve = null;   // 当前 clarify 流程的回调

// === 初始化 ===
init();

function init() {
  // 主题
  const savedTheme = localStorage.getItem('po.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  // API 配置
  const cfg = loadConfig();
  els.cfgBase.value  = cfg.baseUrl || '';
  els.cfgKey.value   = cfg.apiKey || '';
  els.cfgModel.value = cfg.model || '';
  els.cfgTemp.value  = (cfg.temperature ?? 0.3).toString();
  els.cfgClarifyEnabled.checked = cfg.clarifyEnabled !== false; // 默认 true

  // 模板
  renderTemplates();

  // 事件绑定
  bindEvents();
}

function bindEvents() {
  els.btnOptimize.addEventListener('click', onLocalOptimize);
  els.btnAiOptimize.addEventListener('click', onAiOptimize);

  els.btnClear.addEventListener('click', () => {
    els.input.value = '';
    els.input.focus();
  });
  els.btnSample.addEventListener('click', () => {
    els.input.value = '帮我写一个介绍咖啡的文案';
    els.input.focus();
  });

  els.btnCopy.addEventListener('click', async () => {
    if (!lastOutput) { toast('还没有可复制的内容'); return; }
    try {
      await navigator.clipboard.writeText(lastOutput);
      toast('✅ 已复制到剪贴板');
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = lastOutput;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('✅ 已复制');
    }
  });

  els.btnDownload.addEventListener('click', () => {
    if (!lastOutput) { toast('还没有可下载的内容'); return; }
    const blob = new Blob([lastOutput], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimized-prompt-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 设置弹窗
  els.btnSettings.addEventListener('click', () => openModal(els.modalSettings));
  els.btnTemplates.addEventListener('click', () => openModal(els.modalTemplates));
  els.btnTheme.addEventListener('click', toggleTheme);

  $$('[data-close]').forEach(b => b.addEventListener('click', closeAllModals));
  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m) closeAllModals();
  }));

  // 服务商预设
  $$('.chip[data-preset]').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.preset;
      const p = PROVIDER_PRESETS[key];
      if (!p) return;
      els.cfgBase.value = p.baseUrl;
      els.cfgModel.value = p.model;
      els.cfgKey.focus();
      toast(`已填入 ${key} 默认配置`);
    });
  });

  els.btnSaveSettings.addEventListener('click', () => {
    saveConfig({
      baseUrl: els.cfgBase.value.trim(),
      apiKey: els.cfgKey.value.trim(),
      model: els.cfgModel.value.trim(),
      temperature: parseFloat(els.cfgTemp.value) || 0.3,
      clarifyEnabled: els.cfgClarifyEnabled.checked
    });
    toast('✅ 设置已保存（仅本地）');
    closeAllModals();
  });

  // 输入实时诊断
  els.input.addEventListener('input', debounce(onLiveDiagnose, 300));

  // 快捷键 Ctrl/Cmd + Enter
  els.input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onLocalOptimize();
    }
  });

  // 质量评分
  els.btnEvaluate.addEventListener('click', onEvaluate);
}

// === 优化操作 ===

function getOptions() {
  return {
    prompt: els.input.value,
    scenario: els.scenario.value,
    modelStyle: els.modelStyle.value,
    language: els.language.value,
    fewshot: els.optFewshot.checked,
    cot: els.optCot.checked,
    selfcheck: els.optSelfcheck.checked,
    security: els.optSecurity.checked
  };
}

function onLocalOptimize() {
  const opts = getOptions();
  if (!opts.prompt.trim()) {
    toast('请先输入原始提示词');
    els.input.focus();
    return;
  }

  runWithClarification(opts, ({ userAnswers, questions }) => {
    const result = optimize({ ...opts, userAnswers, questions });
    renderOutput(result.output);
    renderDiagnostics(result.diag);
    renderChanges(result.changes);
  });
}

async function onAiOptimize() {
  const opts = getOptions();
  if (!opts.prompt.trim()) {
    toast('请先输入原始提示词');
    els.input.focus();
    return;
  }
  const cfg = loadConfig();
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    toast('请先在「⚙️ 设置」中填写 API Key 等信息');
    openModal(els.modalSettings);
    return;
  }

  runWithClarification(opts, async ({ userAnswers, questions }) => {
    const btn = els.btnAiOptimize;
    btn.disabled = true;
    btn.classList.add('loading');
    const originalLabel = btn.textContent;
    btn.textContent = '🤖 AI 优化中';

    // 立刻显示一份"本地版"作为兜底，并给出诊断
    const local = optimize({ ...opts, userAnswers, questions });
    renderDiagnostics(local.diag);
    renderChanges(['🤖 调用 AI 深度优化中，结果将以流式方式增量呈现...']);
    els.output.textContent = '';
    lastOutput = '';

    try {
      const result = await aiOptimize({
        rawPrompt: opts.prompt,
        config: cfg,
        scenario: opts.scenario,
        modelStyle: opts.modelStyle,
        language: opts.language,
        options: {
          fewshot: opts.fewshot,
          cot: opts.cot,
          selfcheck: opts.selfcheck,
          security: opts.security
        },
        userAnswers,
        questions,
        onChunk: (chunk) => {
          lastOutput += chunk;
          els.output.textContent = lastOutput;
          els.output.scrollTop = els.output.scrollHeight;
        }
      });
      lastOutput = result || lastOutput;
      els.output.textContent = lastOutput;
      const baseChanges = [
        '🤖 已由 AI 深度优化',
        `模型：${cfg.model}`,
        '本地诊断仍按原始提示词分析（见左上角分数）',
        '若 AI 输出不符合预期，可尝试切换"目标模型风格"或重新调整选项'
      ];
      const answeredCount = Object.values(userAnswers || {}).filter(v => v && String(v).trim()).length;
      if (answeredCount > 0) {
        baseChanges.unshift(`🗣️ 已融入你在对话中补充的 ${answeredCount} 项关键信息`);
      }
      renderChanges(baseChanges);
      toast('✅ AI 深度优化完成');
    } catch (e) {
      console.error(e);
      renderChanges(['❌ AI 优化失败：' + e.message, '↪︎ 已为你保留本地优化版本作为兜底']);
      renderOutput(local.output);
      toast('AI 优化失败：' + e.message);
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = originalLabel;
    }
  });
}

function onLiveDiagnose() {
  const text = els.input.value.trim();
  if (!text) {
    els.scoreValue.textContent = '--';
    els.scoreCircle.style.background = `conic-gradient(var(--primary) 0%, var(--bg-soft) 0%)`;
    els.diagList.innerHTML = '<li class="placeholder">输入提示词后将自动诊断</li>';
    return;
  }
  const result = diagnose(text);
  renderDiagnostics(result);
}

// === 渲染 ===

function renderOutput(text) {
  lastOutput = text;
  els.output.textContent = text;
}

function renderDiagnostics({ score, items }) {
  els.scoreValue.textContent = score;
  // 颜色档位
  let color = 'var(--danger)';
  if (score >= 75) color = 'var(--accent)';
  else if (score >= 50) color = 'var(--warn)';
  else if (score >= 25) color = '#f97316';
  els.scoreCircle.style.background = `conic-gradient(${color} ${score * 3.6}deg, var(--bg-soft) 0)`;

  els.diagList.innerHTML = items.map(it => {
    const icon = it.present ? '✓' : (it.severity === 'miss' ? '✗' : '!');
    const cls  = it.present ? 'ok' : it.severity;
    return `<li class="${cls}">
      <span class="icon">${icon}</span>
      <span><b>${escape(it.label)}</b> ${it.present ? '已包含' : '— ' + escape(it.advice)}</span>
    </li>`;
  }).join('');
}

function renderChanges(arr) {
  if (!arr || arr.length === 0) {
    els.changesList.innerHTML = '<li class="placeholder">无新增改动</li>';
    return;
  }
  els.changesList.innerHTML = arr.map(s => `<li>${escape(s)}</li>`).join('');
}

function renderTemplates() {
  els.templateGrid.innerHTML = QUICK_TEMPLATES.map(t => `
    <div class="template-card" data-id="${t.id}">
      <h3>${escape(t.title)}</h3>
      <p>${escape(t.desc)}</p>
      <span class="tag">${escape(t.tag)}</span>
    </div>
  `).join('');
  els.templateGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.template-card');
    if (!card) return;
    const t = QUICK_TEMPLATES.find(x => x.id === card.dataset.id);
    if (!t) return;
    els.input.value = t.prompt;
    closeAllModals();
    onLiveDiagnose();
    toast(`已载入模板：${t.title}`);
  });
}

// === Modal & Theme ===

function openModal(m) { m.classList.remove('hidden'); }
function closeAllModals() { $$('.modal').forEach(m => m.classList.add('hidden')); }

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  els.btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('po.theme', theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// === 配置存储 ===

function loadConfig() {
  try { return JSON.parse(localStorage.getItem('po.cfg') || '{}'); }
  catch { return {}; }
}
function saveConfig(cfg) {
  localStorage.setItem('po.cfg', JSON.stringify(cfg));
}

// === Toast & Helpers ===

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add('hidden'), 2000);
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ============================================================
// === ③ AI 质量评分 ===========================================
// ============================================================

async function onEvaluate() {
  const original = els.input.value.trim();
  if (!original) {
    toast('请先输入原始提示词');
    els.input.focus();
    return;
  }

  // 如果还没优化过，先跑一次本地快速优化
  if (!lastOutput) {
    const result = optimize(getOptions());
    renderOutput(result.output);
    renderDiagnostics(result.diag);
    renderChanges(result.changes);
  }
  const optimized = lastOutput.trim();
  if (!optimized) {
    toast('优化后的提示词为空');
    return;
  }

  const cfg = loadConfig();
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    toast('请先在「⚙️ 设置」中填写 API Key 等信息');
    openModal(els.modalSettings);
    return;
  }

  const btn = els.btnEvaluate;
  btn.disabled = true;
  btn.classList.add('loading');
  const orig = btn.textContent;
  btn.textContent = '🤖 AI 评分中';
  setEvalStatus('正在调用 AI 评估...', '');

  try {
    const result = await evaluatePair({
      original,
      optimized,
      config: cfg,
      onProgress: (msg) => setEvalStatus(msg, '')
    });
    renderEvalResults(result);
    setEvalStatus('✅ 评分完成', 'ok');
    toast('✅ 质量评分完成');
  } catch (e) {
    console.error(e);
    setEvalStatus('❌ ' + e.message, 'error');
    toast('评分失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = orig;
  }
}

function setEvalStatus(text, cls) {
  els.evalStatus.textContent = text;
  els.evalStatus.className = 'eval-status' + (cls ? ' ' + cls : '');
}

/**
 * 渲染评分对比结果
 */
function renderEvalResults({ original, optimized, delta, deltaRaw }) {
  els.evalEmpty.classList.add('hidden');
  els.evalResults.classList.remove('hidden');

  const origPrimary = original.calibrated ?? original.overall;
  const optPrimary  = optimized.calibrated ?? optimized.overall;

  // === 总分卡片 ===
  els.origOverall.textContent = origPrimary.toFixed(1);
  els.optOverall.textContent  = optPrimary.toFixed(1);

  els.origMeta.innerHTML = buildOverallMeta(original);
  els.optMeta.innerHTML  = buildOverallMeta(optimized);

  // delta
  const deltaSign = delta > 0 ? '+' : '';
  els.deltaValue.textContent = deltaSign + delta.toFixed(1);
  els.deltaValue.className = 'card-score ' + (
    delta > 0.1 ? 'delta-positive' : delta < -0.1 ? 'delta-negative' : 'delta-zero'
  );
  const pct = origPrimary > 0 ? Math.round((delta / origPrimary) * 100) : null;
  els.deltaMeta.textContent = pct !== null
    ? `相对提升 ${pct >= 0 ? '+' : ''}${pct}%`
    : '';

  // === 维度对比柱状图 ===
  els.evalDimensions.innerHTML = renderDimensionsHTML(original.dimensions, optimized.dimensions);

  // === 评语 ===
  els.origComment.textContent = original.comment || '（无）';
  els.optComment.textContent  = optimized.comment || '（无）';
}

/**
 * 总分卡片下方的元信息：JSON 加权 / Logprobs 校准
 */
function buildOverallMeta(r) {
  const parts = [];
  parts.push(`权重平均 ${r.overall.toFixed(2)}`);
  if (r.calibrated != null) {
    const m = r.calibrationMethod === 'logprobs' ? 'Logprobs 校准' : 'argmax';
    parts.push(`<span title="${escape(m)}">📐 校准 ${r.calibrated.toFixed(2)}</span>`);
  } else if (r.calibrationError) {
    parts.push(`<span title="${escape(r.calibrationError)}" style="opacity:.6">⚠️ 未校准</span>`);
  }
  return parts.join(' · ');
}

/**
 * 维度并排柱状图
 */
function renderDimensionsHTML(origDims, optDims) {
  const map = new Map(origDims.map(d => [d.key, d]));
  return optDims.map(opt => {
    const o = map.get(opt.key) || { score: 0, reason: '' };
    const oWidth = (o.score / 9) * 100;
    const optWidth = (opt.score / 9) * 100;
    const weightPct = Math.round(opt.weight * 100);
    return `
      <div class="dim-block">
        <div class="dim-title">
          <span>${escape(opt.label)}</span>
          <span class="dim-weight">权重 ${weightPct}%</span>
        </div>
        <div class="dim-row">
          <span class="dim-tag tag-orig">原始</span>
          <div class="dim-bar"><div class="dim-bar-fill orig" style="width: ${oWidth.toFixed(1)}%"></div></div>
          <span class="dim-score">${o.score}</span>
          <span class="dim-reason" title="${escape(o.reason)}">${escape(o.reason)}</span>
        </div>
        <div class="dim-row">
          <span class="dim-tag tag-opt">优化后</span>
          <div class="dim-bar"><div class="dim-bar-fill opt" style="width: ${optWidth.toFixed(1)}%"></div></div>
          <span class="dim-score">${opt.score}</span>
          <span class="dim-reason" title="${escape(opt.reason)}">${escape(opt.reason)}</span>
        </div>
      </div>
    `;
  }).join('');
}



// ============================================================
// === 对话引导补全 (Clarification Flow) ======================
// ============================================================

/**
 * 在执行优化前，先检查是否需要追问关键信息。
 * 如果需要，弹出 modal 收集用户答案；否则直接走原流程。
 *
 * @param {Object} opts             getOptions() 的结果
 * @param {Function} executor       接收 { userAnswers, questions } 后真正执行优化的函数
 */
function runWithClarification(opts, executor) {
  const cfg = loadConfig();
  const enabledGlobally = cfg.clarifyEnabled !== false;

  // 全局禁用 / 本次会话已跳过 → 直接执行
  if (!enabledGlobally || sessionSkipClarify) {
    executor({ userAnswers: {}, questions: [] });
    return;
  }

  const questions = getClarificationQuestions({
    prompt: opts.prompt,
    scenario: opts.scenario
  });

  if (questions.length === 0) {
    // 不需要问 → 直接执行
    executor({ userAnswers: {}, questions: [] });
    return;
  }

  // 弹出对话引导窗口
  openClarifyModal(questions, (answers) => {
    executor({ userAnswers: answers, questions });
  });
}

/**
 * 渲染并展示追问 modal
 */
function openClarifyModal(questions, onProceed) {
  els.clarifyCount.textContent = questions.length;
  els.clarifySkipFuture.checked = false;
  els.clarifyQuestions.innerHTML = questions.map(renderClarifyQuestion).join('');

  const continueBtn = els.btnClarifyContinue;
  const skipBtn     = els.btnClarifySkip;

  // 实时监听输入，启用/禁用"继续优化"按钮
  const refreshContinue = () => {
    const allRequiredFilled = questions
      .filter(q => q.required)
      .every(q => {
        const v = readQuestionValue(q.key);
        return v && String(v).trim();
      });
    continueBtn.disabled = !allRequiredFilled;
    continueBtn.textContent = allRequiredFilled
      ? '继续优化 →'
      : '请先填写必填项';
  };

  // 绑定输入监听
  els.clarifyQuestions.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', refreshContinue);
    el.addEventListener('change', refreshContinue);
  });
  refreshContinue();

  // 继续优化
  continueBtn.onclick = () => {
    const answers = {};
    let firstMissing = null;
    for (const q of questions) {
      const v = readQuestionValue(q.key);
      if (q.required && (!v || !String(v).trim())) {
        firstMissing = q;
        markQuestionMissing(q.key);
      } else if (v && String(v).trim()) {
        answers[q.key] = String(v).trim();
      }
    }
    if (firstMissing) {
      toast('请填写必填项：' + firstMissing.label);
      return;
    }

    if (els.clarifySkipFuture.checked) sessionSkipClarify = true;
    closeAllModals();
    onProceed(answers);
  };

  // 跳过本次（不填用户答案，使用占位符）
  skipBtn.onclick = () => {
    if (els.clarifySkipFuture.checked) sessionSkipClarify = true;
    closeAllModals();
    onProceed({});
  };

  // 取消按钮（X）已通过 data-close 处理，但要清空回调
  pendingClarifyResolve = null;
  openModal(els.modalClarify);

  // focus 第一个问题
  const firstInput = els.clarifyQuestions.querySelector('input, textarea, select');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
}

/**
 * 渲染单个问题
 */
function renderClarifyQuestion(q) {
  const cls = q.required ? 'clarify-q required' : 'clarify-q';
  const tag = q.required
    ? '<span class="clarify-q-tag required">必填</span>'
    : '<span class="clarify-q-tag optional">可选</span>';
  const icon = q.required ? '⭐' : '·';

  const ph = escape(q.placeholder || '');
  const labelEsc = escape(q.label);
  const hintEsc = escape(q.hint || '');

  let inputHtml = '';
  if (q.type === 'textarea') {
    inputHtml = `<textarea data-q-key="${q.key}" placeholder="${ph}"></textarea>`;
  } else if (q.type === 'datalist') {
    const datalistId = `dl-${q.key}`;
    const opts = (q.options || []).map(o => `<option value="${escape(o)}">`).join('');
    inputHtml =
      `<input type="text" data-q-key="${q.key}" list="${datalistId}" placeholder="${ph}" />
       <datalist id="${datalistId}">${opts}</datalist>`;
  } else if (q.type === 'select') {
    const opts = (q.options || []).map(o => {
      const val = typeof o === 'string' ? o : o.value;
      const lbl = typeof o === 'string' ? o : o.label;
      return `<option value="${escape(val)}">${escape(lbl)}</option>`;
    }).join('');
    inputHtml = `<select data-q-key="${q.key}"><option value="">请选择...</option>${opts}</select>`;
  } else {
    inputHtml = `<input type="text" data-q-key="${q.key}" placeholder="${ph}" />`;
  }

  return `
    <div class="${cls}" data-q-block="${q.key}">
      <div class="clarify-q-head">
        <span class="clarify-q-icon">${icon}</span>
        <span class="clarify-q-label">${labelEsc}</span>
        ${tag}
      </div>
      ${q.hint ? `<p class="clarify-q-hint">${hintEsc}</p>` : ''}
      ${inputHtml}
    </div>
  `;
}

function readQuestionValue(key) {
  const el = els.clarifyQuestions.querySelector(`[data-q-key="${CSS.escape(key)}"]`);
  return el ? el.value : '';
}

function markQuestionMissing(key) {
  const block = els.clarifyQuestions.querySelector(`[data-q-block="${CSS.escape(key)}"]`);
  if (!block) return;
  block.classList.add('missing');
  setTimeout(() => block.classList.remove('missing'), 600);
  const input = block.querySelector('input, textarea, select');
  if (input) input.focus();
}
