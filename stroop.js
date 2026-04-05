/**
 * stroop.js — Stroop Task Module
 * ═══════════════════════════════════════════════════════════
 * Implements the classic Stroop color-word interference task.
 *
 * Design:
 *   - 24 trials: 12 congruent + 12 incongruent (randomized)
 *   - Stimuli: words RED / BLUE / GREEN in R/B/G font colors
 *   - Response: keyboard keys R, B, G
 *   - 500ms fixation cross → stimulus → response (max 3s)
 *   - 300ms inter-trial interval
 *
 * Logged fields (in addition to core CEP schema):
 *   stimulus_word   : "RED" | "BLUE" | "GREEN"
 *   stimulus_color  : "red" | "blue" | "green"
 *   user_key        : raw key pressed
 *
 * Computed metrics:
 *   mean_rt_congruent   : ms
 *   mean_rt_incongruent : ms
 *   interference_score  : incongruent - congruent (ms)
 *   accuracy_congruent  : %
 *   accuracy_incongruent: %
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.stroop = (() => {

  // ── Configuration ─────────────────────────────────────────
  const CONFIG = {
    trialsPerCondition:   12,   // 12 congruent + 12 incongruent
    fixationDuration:    500,   // ms
    maxResponseTime:    3000,   // ms (trial times out)
    itiDuration:         300,   // inter-trial interval ms
  };

  // Valid stimulus words and their CSS color classes
  const WORDS  = ['RED', 'BLUE', 'GREEN'];
  const COLORS = ['red', 'blue', 'green'];

  // Key→color mapping
  const KEY_MAP = { r: 'red', b: 'blue', g: 'green' };

  // Internal state
  let trials       = [];    // pre-generated trial list
  let currentIndex = 0;     // which trial we're on
  let trialStartMs = 0;     // timestamp when stimulus appeared
  let responseWindow = null;// timeout handle
  let keyHandler   = null;  // bound listener (so we can remove it)
  let onComplete   = null;  // callback when all trials done

  // ── DOM references (resolved once at init) ─────────────────
  let dom = {};

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getInstructions
  // Returns HTML string for the instructions screen.
  // ─────────────────────────────────────────────────────────────
  function getInstructions() {
    return `
      <p>You will see a <strong>color word</strong> (RED, BLUE, or GREEN)
      printed in a colored font. Your job is to respond to the
      <em>font color</em> — NOT the word itself.</p>
      <ul>
        <li>Press <span class="key">R</span> if the font color is <strong style="color:#e05c5c">RED</strong></li>
        <li>Press <span class="key">B</span> if the font color is <strong style="color:#5b8ef0">BLUE</strong></li>
        <li>Press <span class="key">G</span> if the font color is <strong style="color:#4ec994">GREEN</strong></li>
      </ul>
      <p>Respond as <strong>quickly and accurately</strong> as possible.</p>
      <div class="warn">⚠ Focus on the <em>color of the ink</em>, not what the word says.</div>
      <p>There are <strong>${CONFIG.trialsPerCondition * 2} trials</strong> total.</p>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // generateTrials
  // Creates a balanced, randomized list of congruent + incongruent
  // trials. Each trial is { word, color, condition }.
  // ─────────────────────────────────────────────────────────────
  function generateTrials() {
    const list = [];

    // Helper: pick a random element from an array
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // ── Congruent trials: word === color ──
    for (let i = 0; i < CONFIG.trialsPerCondition; i++) {
      const color = COLORS[i % COLORS.length]; // cycle through colors evenly
      list.push({ word: color.toUpperCase(), color, condition: 'congruent' });
    }

    // ── Incongruent trials: word ≠ color ──
    for (let i = 0; i < CONFIG.trialsPerCondition; i++) {
      const wordIdx  = i % WORDS.length;
      // Pick a color that is different from the word
      const colorIdx = (wordIdx + 1 + Math.floor(Math.random() * 2)) % COLORS.length;
      list.push({
        word:      WORDS[wordIdx],
        color:     COLORS[colorIdx],
        condition: 'incongruent'
      });
    }

    // ── Shuffle using Fisher-Yates ──
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    return list;
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: init
  // Set up DOM references, generate trials, attach listeners.
  // ─────────────────────────────────────────────────────────────
  function init(completionCallback) {
    onComplete = completionCallback;

    dom = {
      area:      document.getElementById('stroop-area'),
      fixation:  document.getElementById('fixation'),
      word:      document.getElementById('stroop-word'),
      counter:   document.getElementById('trial-counter'),
      expLabel:  document.getElementById('exp-label'),
      expScreen: document.getElementById('screen-experiment'),
      tapBtns:   document.getElementById('stroop-tap-btns')
    };

    trials       = generateTrials();
    currentIndex = 0;

    dom.expLabel.textContent = 'Stroop Task';
    dom.area.classList.remove('hidden');

    // Wire up tap buttons for mobile
    dom.tapBtns.querySelectorAll('.stroop-tap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        const keyMap = { red: 'r', blue: 'b', green: 'g' };
        const rt = Math.round(performance.now() - trialStartMs);
        recordResponse(keyMap[color], color, rt);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: start
  // Kicks off the first trial.
  // ─────────────────────────────────────────────────────────────
  function start() {
    runTrial();
  }

  // ─────────────────────────────────────────────────────────────
  // runTrial
  // Shows fixation → then stimulus for the current trial index.
  // ─────────────────────────────────────────────────────────────
  function runTrial() {
    if (currentIndex >= trials.length) {
      endTask();
      return;
    }

    const total = trials.length;
    dom.counter.textContent = `Trial ${currentIndex + 1} / ${total}`;

    // ── Phase 1: Show fixation cross ──
    dom.fixation.style.display = 'block';
    dom.word.style.display     = 'none';
    dom.word.className         = 'stroop-word'; // reset classes

    setTimeout(() => {
      showStimulus();
    }, CONFIG.fixationDuration);
  }

  // ─────────────────────────────────────────────────────────────
  // showStimulus
  // Renders the color word and starts the response timer.
  // ─────────────────────────────────────────────────────────────
  function showStimulus() {
    const trial = trials[currentIndex];

    // Hide fixation, show word
    dom.fixation.style.display = 'none';
    dom.word.style.display     = 'flex';
    dom.word.textContent       = trial.word;
    dom.word.className         = `stroop-word color-${trial.color}`;

    // Show tap buttons for mobile
    dom.tapBtns.classList.remove('hidden');

    // Record stimulus onset time
    trialStartMs = performance.now();

    // Attach keyboard listener
    keyHandler = handleKeypress;
    document.addEventListener('keydown', keyHandler);

    // Auto-timeout if no response within maxResponseTime
    responseWindow = setTimeout(() => {
      recordResponse(null, null); // null = timeout / no response
    }, CONFIG.maxResponseTime);
  }

  // ─────────────────────────────────────────────────────────────
  // handleKeypress
  // Captures R/B/G key presses during the response window.
  // ─────────────────────────────────────────────────────────────
  function handleKeypress(e) {
    const key = e.key.toLowerCase();
    if (!KEY_MAP[key]) return; // ignore irrelevant keys

    const rt = Math.round(performance.now() - trialStartMs);
    const responseColor = KEY_MAP[key];
    recordResponse(key, responseColor, rt);
  }

  // ─────────────────────────────────────────────────────────────
  // recordResponse
  // Logs the trial, gives visual feedback, advances to next trial.
  // ─────────────────────────────────────────────────────────────
  function recordResponse(key, responseColor, rt) {
    // Remove listener + cancel timeout
    document.removeEventListener('keydown', keyHandler);
    clearTimeout(responseWindow);

    // Hide tap buttons
    dom.tapBtns.classList.add('hidden');

    const trial   = trials[currentIndex];
    const correct = responseColor === trial.color ? 1 : 0;

    // ── Log to CEP dataset ──
    CEP.data.logTrial({
      condition:      trial.condition,
      stimulus:       `${trial.word}-${trial.color}`, // e.g. "RED-blue"
      response:       responseColor || 'timeout',
      correct,
      rt_ms:          rt ?? -1,
      // Experiment-specific extras
      stimulus_word:  trial.word,
      stimulus_color: trial.color,
      user_key:       key || 'none'
    });

    // ── Visual feedback flash ──
    showFeedback(correct);

    // ── Advance ──
    currentIndex++;
    dom.word.style.display = 'none';

    setTimeout(() => { runTrial(); }, CONFIG.itiDuration);
  }

  // ─────────────────────────────────────────────────────────────
  // showFeedback
  // Briefly flashes the background green/red.
  // ─────────────────────────────────────────────────────────────
  function showFeedback(correct) {
    const cls = correct ? 'flash-correct' : 'flash-wrong';
    dom.expScreen.classList.add(cls);
    setTimeout(() => dom.expScreen.classList.remove(cls), 300);
  }

  // ─────────────────────────────────────────────────────────────
  // endTask
  // All trials complete. Compute metrics and call onComplete.
  // ─────────────────────────────────────────────────────────────
  function endTask() {
    dom.area.classList.add('hidden');
    const metrics = computeMetrics();
    onComplete(metrics);
  }

  // ─────────────────────────────────────────────────────────────
  // computeMetrics
  // Derives summary statistics from the logged trial data.
  // Returns an array of metric objects for the results screen.
  // ─────────────────────────────────────────────────────────────
  function computeMetrics() {
    const { mean, accuracy } = CEP.data.utils;
    const dataset = CEP.data.getDataset();

    const congruent   = dataset.filter(t => t.condition === 'congruent'   && t.rt_ms > 0);
    const incongruent = dataset.filter(t => t.condition === 'incongruent' && t.rt_ms > 0);

    const rtCon   = mean(congruent.map(t => t.rt_ms));
    const rtIncon = mean(incongruent.map(t => t.rt_ms));
    const interference = (rtCon !== null && rtIncon !== null)
      ? Math.round(rtIncon - rtCon)
      : null;

    const accCon   = accuracy(dataset.filter(t => t.condition === 'congruent'));
    const accIncon = accuracy(dataset.filter(t => t.condition === 'incongruent'));

    return [
      {
        label: 'Mean RT — Congruent',
        value: rtCon   ? Math.round(rtCon)   : 'N/A',
        unit:  'ms',
        type:  'default'
      },
      {
        label: 'Mean RT — Incongruent',
        value: rtIncon ? Math.round(rtIncon) : 'N/A',
        unit:  'ms',
        type:  'default'
      },
      {
        label: 'Interference Score',
        value: interference !== null ? `+${interference}` : 'N/A',
        unit:  'ms (incongruent − congruent)',
        type:  interference > 80 ? 'warn' : 'highlight'
      },
      {
        label: 'Accuracy — Congruent',
        value: accCon   !== null ? `${accCon}%`   : 'N/A',
        unit:  `${dataset.filter(t=>t.condition==='congruent').length} trials`,
        type:  accCon >= 80 ? 'good' : 'warn'
      },
      {
        label: 'Accuracy — Incongruent',
        value: accIncon !== null ? `${accIncon}%` : 'N/A',
        unit:  `${dataset.filter(t=>t.condition==='incongruent').length} trials`,
        type:  accIncon >= 80 ? 'good' : 'warn'
      },
      {
        label: 'Total Trials',
        value: dataset.length,
        unit:  'completed',
        type:  'default'
      }
    ];
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getChartData
  // Returns data formatted for Plotly chart on results screen.
  // ─────────────────────────────────────────────────────────────
  function getChartData() {
    const dataset = CEP.data.getDataset();
    const { mean } = CEP.data.utils;

    const congruent   = dataset.filter(t => t.condition === 'congruent'   && t.rt_ms > 0);
    const incongruent = dataset.filter(t => t.condition === 'incongruent' && t.rt_ms > 0);

    return {
      type: 'bar',
      title: 'Mean Reaction Time by Condition',
      xLabels: ['Congruent', 'Incongruent'],
      yValues: [
        Math.round(mean(congruent.map(t => t.rt_ms))   || 0),
        Math.round(mean(incongruent.map(t => t.rt_ms)) || 0)
      ],
      colors: ['#4ec994', '#e05c5c'],
      yLabel: 'Mean RT (ms)'
    };
  }

  // Public API
  return {
    getInstructions,
    init,
    start,
    getChartData
  };

})();
