/**
 * app.js — Main Application Controller
 * ═══════════════════════════════════════════════════════════
 * Handles:
 *   · Screen navigation (start → instructions → experiment → results)
 *   · Participant ID & experiment selection
 *   · Experiment module dispatch
 *   · Results display: metrics grid + Plotly chart
 *   · Raw data table toggle
 *   · Export button wiring
 * ═══════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let selectedExp     = null;   // "stroop" | "memory" | "falsememory"
  let participantId   = null;

  // ── Experiment module map ──────────────────────────────────
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

  /**
   * showScreen
   * Deactivates all screens and activates the target screen.
   */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    target.classList.add('active');
    // Re-trigger the fadeUp animation
    target.style.animation = 'none';
    target.offsetHeight; // reflow
    target.style.animation = '';
  }

  // ═══════════════════════════════════════════════════════════
  // START SCREEN
  // ═══════════════════════════════════════════════════════════

  const pidInput  = document.getElementById('participant-id');
  const btnStart  = document.getElementById('btn-start');
  const expCards  = document.querySelectorAll('.exp-card');

  // Validate start button enable/disable
  function validateStartForm() {
    const pidOk = pidInput.value.trim().length >= 2;
    const expOk = selectedExp !== null;
    btnStart.disabled = !(pidOk && expOk);
  }

  // Participant ID input
  pidInput.addEventListener('input', validateStartForm);

  // Experiment card selection
  expCards.forEach(card => {
    card.addEventListener('click', () => {
      expCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedExp = card.dataset.exp;
      validateStartForm();
    });
  });

  // Start button
  btnStart.addEventListener('click', () => {
    participantId = pidInput.value.trim();
    showInstructions();
  });

  // ═══════════════════════════════════════════════════════════
  // INSTRUCTIONS SCREEN
  // ═══════════════════════════════════════════════════════════

  function showInstructions() {
    const mod = EXP_MODULES[selectedExp];

    document.getElementById('instr-title').textContent = EXP_LABELS[selectedExp];
    document.getElementById('instr-body').innerHTML    = mod.getInstructions();

    showScreen('screen-instructions');
  }

  document.getElementById('btn-begin').addEventListener('click', () => {
    startExperiment();
  });

  // ═══════════════════════════════════════════════════════════
  // EXPERIMENT SCREEN
  // ═══════════════════════════════════════════════════════════

  function startExperiment() {
    // Init data session
    CEP.data.initSession(participantId, selectedExp);

    // Hide all task areas
    document.querySelectorAll('.task-area').forEach(a => a.classList.add('hidden'));

    // Init selected module
    const mod = EXP_MODULES[selectedExp];
    mod.init(onExperimentComplete);

    showScreen('screen-experiment');

    // Brief delay so screen transition finishes before stimuli
    setTimeout(() => { mod.start(); }, 400);
  }

  // ═══════════════════════════════════════════════════════════
  // EXPERIMENT COMPLETE → RESULTS
  // ═══════════════════════════════════════════════════════════

  /**
   * onExperimentComplete
   * Called by experiment modules when all trials are done.
   * @param {Object[]} metrics — array of {label, value, unit, type}
   */
  function onExperimentComplete(metrics) {
    renderResults(metrics);
    showScreen('screen-results');
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS SCREEN
  // ═══════════════════════════════════════════════════════════

  function renderResults(metrics) {
    // Header
    document.getElementById('results-title').textContent = EXP_LABELS[selectedExp];
    document.getElementById('results-pid').textContent =
      `Participant: ${participantId}  ·  Trials: ${CEP.data.getTrialCount()}`;

    // ── Metrics Grid ──
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

    // ── Plotly Chart ──
    renderChart();

    // ── Raw data table (hidden by default) ──
    renderRawTable();
  }

  // ─────────────────────────────────────────────────────────────
  // renderChart
  // Uses the module's getChartData() to generate a Plotly chart.
  // ─────────────────────────────────────────────────────────────
  function renderChart() {
    const chartArea = document.getElementById('chart-area');
    const mod       = EXP_MODULES[selectedExp];

    if (!mod.getChartData || typeof Plotly === 'undefined') {
      chartArea.style.display = 'none';
      return;
    }

    chartArea.style.display = 'block';
    const cd = mod.getChartData();

    const trace = {
      x:           cd.xLabels,
      y:           cd.yValues,
      type:        'bar',
      marker: {
        color:        cd.colors || ['#f5a623'],
        line: { color: 'rgba(0,0,0,0)', width: 0 }
      },
      hovertemplate: `<b>%{x}</b><br>${cd.yLabel}: %{y}<extra></extra>`
    };

    const layout = {
      title: {
        text:      cd.title,
        font:      { family: 'IBM Plex Mono', size: 13, color: '#d8dce8' },
        xref:      'paper',
        x:          0.02
      },
      paper_bgcolor: 'transparent',
      plot_bgcolor:  'transparent',
      font:  { family: 'IBM Plex Mono', color: '#d8dce8', size: 11 },
      xaxis: {
        tickfont:    { color: '#636b7e', size: 10 },
        gridcolor:   '#252932',
        zerolinecolor: '#252932',
        linecolor:   '#252932'
      },
      yaxis: {
        title:       { text: cd.yLabel, font: { size: 10, color: '#636b7e' } },
        tickfont:    { color: '#636b7e', size: 10 },
        gridcolor:   '#252932',
        zerolinecolor: '#252932',
        linecolor:   '#252932'
      },
      margin:  { l: 52, r: 16, t: 40, b: 50 },
      bargap:  0.35
    };

    const config = {
      responsive:  true,
      displaylogo: false,
      modeBarButtonsToRemove: ['pan2d','select2d','lasso2d','resetScale2d','toggleSpikelines']
    };

    Plotly.newPlot(chartArea, [trace], layout, config);
  }

  // ─────────────────────────────────────────────────────────────
  // renderRawTable
  // Builds an HTML table from the raw trial dataset.
  // ─────────────────────────────────────────────────────────────
  function renderRawTable() {
    const dataset = CEP.data.getDataset();
    if (!dataset.length) return;

    const columns = Object.keys(dataset[0]);
    let html = '<div class="raw-table-wrap"><table><thead><tr>';
    columns.forEach(col => { html += `<th>${col}</th>`; });
    html += '</tr></thead><tbody>';

    dataset.forEach(row => {
      html += '<tr>';
      columns.forEach(col => {
        const val    = row[col] ?? '';
        const cls    = col === 'correct' ? `correct-${val}` : '';
        html += `<td class="${cls}">${val}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    document.getElementById('raw-table-wrap').innerHTML = html;
  }

  // ─────────────────────────────────────────────────────────────
  // Raw data toggle
  // ─────────────────────────────────────────────────────────────
  document.getElementById('btn-toggle-raw').addEventListener('click', function () {
    const wrap = document.getElementById('raw-table-wrap');
    const hidden = wrap.classList.toggle('hidden');
    this.textContent = hidden ? 'Show Raw Trial Data' : 'Hide Raw Trial Data';
  });

  // ─────────────────────────────────────────────────────────────
  // Export button
  // ─────────────────────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', () => {
    const filename = CEP.export.downloadCSV();
    if (filename) {
      // Brief visual confirmation
      const btn = document.getElementById('btn-export');
      const orig = btn.textContent;
      btn.textContent = '✓ Downloaded!';
      btn.style.background = '#4ec994';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = '';
      }, 2000);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Restart button
  // ─────────────────────────────────────────────────────────────
  document.getElementById('btn-restart').addEventListener('click', () => {
    // Reset state
    selectedExp   = null;
    participantId = null;

    // Reset start screen
    pidInput.value = '';
    expCards.forEach(c => c.classList.remove('selected'));
    btnStart.disabled = true;

    // Clear chart area to avoid stale Plotly chart
    const chartArea = document.getElementById('chart-area');
    if (typeof Plotly !== 'undefined') Plotly.purge(chartArea);

    showScreen('screen-start');
  });

  // ═══════════════════════════════════════════════════════════
  // INIT — show start screen
  // ═══════════════════════════════════════════════════════════
  showScreen('screen-start');

})();
