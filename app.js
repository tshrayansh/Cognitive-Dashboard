/**
 * app.js — Main Application Controller  (CEP v2)
 * ═══════════════════════════════════════════════════════════
 * Handles:
 *   · 2-step onboarding (participant info → experiment select)
 *   · Gender / age / major / sleep fields
 *   · Screen transitions
 *   · Experiment dispatch
 *   · Results / chart / export wiring
 * ═══════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ── App state ──────────────────────────────────────────────
  let selectedExp  = null;
  let participant  = {
    id:    null,
    gender: null,
    age:   null,
    major: null,
    sleep: null
  };

  const EXP_MODULES = {
    stroop:      CEP.stroop,
    memory:      CEP.memory,
    falsememory: CEP.falseMemory
  };
  const EXP_LABELS = {
    stroop:      'Stroop Task',
    memory:      'Working Memory',
    falsememory: 'False Memory Task'
  };

  // ═══════════════════════════════════════════════════════════
  // SCREEN NAVIGATION
  // ═══════════════════════════════════════════════════════════
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const t = document.getElementById(id);
    t.style.animation = 'none';
    t.offsetHeight;
    t.style.animation = '';
    t.classList.add('active');
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 1 — PARTICIPANT INFO
  // ═══════════════════════════════════════════════════════════

  const pidInput   = document.getElementById('participant-id');
  const ageInput   = document.getElementById('p-age');
  const majorInput = document.getElementById('p-major');
  const sleepInput = document.getElementById('p-sleep');
  const genderBtns = document.querySelectorAll('#gender-group .toggle-btn');
  const btnStep1   = document.getElementById('btn-step1-next');

  let selectedGender = null;

  // Gender toggle
  genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      genderBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGender = btn.dataset.val;
      validateStep1();
    });
  });

  // Validate step 1: require ID (≥2 chars), gender, age, major, sleep
  function validateStep1() {
    const ok =
      pidInput.value.trim().length >= 2 &&
      selectedGender !== null &&
      ageInput.value.trim() !== '' &&
      majorInput.value.trim().length >= 1 &&
      sleepInput.value.trim() !== '';
    btnStep1.disabled = !ok;
  }
  [pidInput, ageInput, majorInput, sleepInput].forEach(el =>
    el.addEventListener('input', validateStep1)
  );

  // Step 1 → Step 2
  btnStep1.addEventListener('click', () => {
    participant = {
      id:     pidInput.value.trim(),
      gender: selectedGender,
      age:    parseInt(ageInput.value),
      major:  majorInput.value.trim(),
      sleep:  parseFloat(sleepInput.value)
    };
    goToStep2();
  });

  function goToStep2() {
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-1').classList.remove('active');
    document.getElementById('step-2').classList.remove('hidden');
    document.getElementById('step-2').classList.add('active');
    // Step dots
    document.querySelectorAll('.step-dot').forEach((d,i) => {
      d.classList.toggle('active', i === 1);
    });
    document.getElementById('step-num').textContent = '2';
  }

  // Step 2 → back
  document.getElementById('btn-step2-back').addEventListener('click', () => {
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-1').classList.remove('hidden');
    document.getElementById('step-1').classList.add('active');
    document.querySelectorAll('.step-dot').forEach((d,i) => {
      d.classList.toggle('active', i === 0);
    });
    document.getElementById('step-num').textContent = '1';
    selectedExp = null;
    document.querySelectorAll('.exp-select-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('btn-start').disabled = true;
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 2 — EXPERIMENT SELECTION
  // ═══════════════════════════════════════════════════════════

  document.querySelectorAll('.exp-select-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.exp-select-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedExp = card.dataset.exp;
      document.getElementById('btn-start').disabled = false;
    });
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    showInstructions();
  });

  // ═══════════════════════════════════════════════════════════
  // INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════
  function showInstructions() {
    const mod = EXP_MODULES[selectedExp];
    document.getElementById('instr-exp-tag').textContent  = EXP_LABELS[selectedExp];
    document.getElementById('instr-title').textContent    = EXP_LABELS[selectedExp];
    document.getElementById('instr-body').innerHTML       = mod.getInstructions();
    showScreen('screen-instructions');
  }

  document.getElementById('btn-begin').addEventListener('click', startExperiment);

  // ═══════════════════════════════════════════════════════════
  // EXPERIMENT
  // ═══════════════════════════════════════════════════════════
  function startExperiment() {
    // Init data session with full participant metadata
    CEP.data.initSession({
      participantId: participant.id,
      experiment:    selectedExp,
      gender:        participant.gender,
      age:           participant.age,
      major:         participant.major,
      sleepHours:    participant.sleep
    });

    // Reset task areas
    document.querySelectorAll('.task-area').forEach(a => a.classList.add('hidden'));
    document.getElementById('exp-progress-fill').style.width = '0%';

    // Init module
    const mod = EXP_MODULES[selectedExp];
    mod.init(onExperimentComplete);

    showScreen('screen-experiment');
    setTimeout(() => mod.start(), 450);
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════
  function onExperimentComplete(metrics) {
    // Set progress to 100%
    document.getElementById('exp-progress-fill').style.width = '100%';
    setTimeout(() => {
      renderResults(metrics);
      showScreen('screen-results');
    }, 300);
  }

  function renderResults(metrics) {
    const s = CEP.data.getSession();
    document.getElementById('results-title').textContent = EXP_LABELS[selectedExp];
    document.getElementById('results-pid').textContent =
      `${s.participantId} · ${s.gender ?? '—'} · Age ${s.age ?? '—'} · ${s.major ?? '—'} · ${s.sleepHours ?? '—'}h sleep · ${CEP.data.getTrialCount()} trials`;

    // Metrics grid
    const grid = document.getElementById('metrics-grid');
    grid.innerHTML = '';
    metrics.forEach(m => {
      const card = document.createElement('div');
      card.className = `metric-card ${m.type || ''}`;
      card.innerHTML = `
        <div class="metric-label">${m.label}</div>
        <div class="metric-value">${m.value}</div>
        <div class="metric-unit">${m.unit}</div>
      `;
      grid.appendChild(card);
    });

    renderChart();
    renderRawTable();
  }

  function renderChart() {
    const chartArea = document.getElementById('chart-area');
    const mod       = EXP_MODULES[selectedExp];
    if (!mod.getChartData || typeof Plotly === 'undefined') {
      chartArea.style.display = 'none'; return;
    }
    chartArea.style.display = 'block';
    const cd = mod.getChartData();

    Plotly.newPlot(chartArea, [{
      x: cd.xLabels, y: cd.yValues, type: 'bar',
      marker: {
        color: cd.colors,
        opacity: 0.9,
        line: { width: 0 }
      },
      hovertemplate: `<b>%{x}</b><br>${cd.yLabel}: %{y}<extra></extra>`
    }], {
      title: { text: cd.title, font: { family: 'DM Sans', size: 13, color: '#cbd5e1' }, xref: 'paper', x: 0.02 },
      paper_bgcolor: 'transparent',
      plot_bgcolor:  'transparent',
      font:  { family: 'DM Mono', color: '#cbd5e1', size: 11 },
      xaxis: { tickfont: { color: '#94a3b8', size: 11 }, gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.05)', linecolor: 'rgba(255,255,255,0.05)' },
      yaxis: { title: { text: cd.yLabel, font: { size: 10, color: '#94a3b8' } }, tickfont: { color: '#94a3b8', size: 11 }, gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.05)', linecolor: 'rgba(255,255,255,0.05)' },
      margin: { l: 52, r: 16, t: 44, b: 52 },
      bargap: 0.38
    }, {
      responsive: true, displaylogo: false,
      modeBarButtonsToRemove: ['pan2d','select2d','lasso2d','resetScale2d','toggleSpikelines']
    });
  }

  function renderRawTable() {
    const dataset = CEP.data.getDataset();
    if (!dataset.length) return;
    const cols = Object.keys(dataset[0]);
    let html = '<table><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    dataset.forEach(row => {
      html += '<tr>' + cols.map(c => {
        const v   = row[c] ?? '';
        const cls = c === 'correct' ? `correct-${v}` : '';
        return `<td class="${cls}">${v}</td>`;
      }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('raw-table-wrap').innerHTML = html;
  }

  // Raw toggle
  document.getElementById('btn-toggle-raw').addEventListener('click', function () {
    const wrap   = document.getElementById('raw-table-wrap');
    const hidden = wrap.classList.toggle('hidden');
    this.innerHTML = hidden
      ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Show Raw Trial Data'
      : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Hide Raw Trial Data';
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    const filename = CEP.export.downloadCSV();
    if (filename) {
      const btn = document.getElementById('btn-export');
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Downloaded!';
      btn.style.background = 'linear-gradient(135deg,#34d399,#059669)';
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2200);
    }
  });

  // Restart
  document.getElementById('btn-restart').addEventListener('click', () => {
    selectedExp    = null;
    participant    = { id: null, gender: null, age: null, major: null, sleep: null };
    selectedGender = null;

    // Reset form
    pidInput.value   = '';
    ageInput.value   = '';
    majorInput.value = '';
    sleepInput.value = '';
    genderBtns.forEach(b => b.classList.remove('active'));
    btnStep1.disabled = true;

    // Reset step
    document.getElementById('step-1').classList.remove('hidden');
    document.getElementById('step-1').classList.add('active');
    document.getElementById('step-2').classList.add('hidden');
    document.querySelectorAll('.step-dot').forEach((d,i) => d.classList.toggle('active', i === 0));
    document.getElementById('step-num').textContent = '1';

    document.querySelectorAll('.exp-select-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('btn-start').disabled = true;

    if (typeof Plotly !== 'undefined') Plotly.purge(document.getElementById('chart-area'));

    showScreen('screen-start');
  });

  // ── Init ──
  showScreen('screen-start');

})();
