// =============================================================
// app.js — UI 控制器
// =============================================================

import { optimize } from './optimizer.js';
import { aiOptimize, PROVIDER_PRESETS } from './ai-optimizer.js';
import { QUICK_TEMPLATES } from './templates.js';
import { diagnose } from './diagnoser.js';

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
  toast: $('#toast')
};

// === 状态 ===
let lastOutput = '';

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
      temperature: parseFloat(els.cfgTemp.value) || 0.3
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
  const result = optimize(opts);
  renderOutput(result.output);
  renderDiagnostics(result.diag);
  renderChanges(result.changes);
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

  const btn = els.btnAiOptimize;
  btn.disabled = true;
  btn.classList.add('loading');
  const originalLabel = btn.textContent;
  btn.textContent = '🤖 AI 优化中';

  // 立刻显示一份"本地版"作为兜底，并给出诊断
  const local = optimize(opts);
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
      onChunk: (chunk) => {
        lastOutput += chunk;
        els.output.textContent = lastOutput;
        els.output.scrollTop = els.output.scrollHeight;
      }
    });
    lastOutput = result || lastOutput;
    els.output.textContent = lastOutput;
    renderChanges([
      '🤖 已由 AI 深度优化',
      `模型：${cfg.model}`,
      '本地诊断仍按原始提示词分析（见左上角分数）',
      '若 AI 输出不符合预期，可尝试切换"目标模型风格"或重新调整选项'
    ]);
    toast('✅ AI 深度优化完成');
  } catch (e) {
    console.error(e);
    renderChanges(['❌ AI 优化失败：' + e.message, '↪︎ 已为你保留本地优化版本作为兜底']);
    // 失败时回退到本地优化
    renderOutput(local.output);
    toast('AI 优化失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = originalLabel;
  }
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
