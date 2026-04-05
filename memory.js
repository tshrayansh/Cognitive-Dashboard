/**
 * memory.js — Working Memory Task Module
 * ═══════════════════════════════════════════════════════════
 * Digit span / working memory capacity task with three load levels.
 *
 * Design:
 *   - 3 sequence lengths: 3, 5, 7 digits
 *   - 3 trials per length = 9 trials total
 *   - Each digit shown for 800ms, 200ms blank between digits
 *   - Retention interval: 1500ms with optional interference task
 *   - Interference: judge whether a random number is Odd/Even (O/E keys)
 *   - Recall: free type → submit
 *
 * Logged fields (in addition to core CEP schema):
 *   sequence_length      : 3 | 5 | 7
 *   presented_sequence   : "4 7 2"
 *   interference_correct : 1 | 0 | -1 (−1 if no interference)
 *
 * Computed metrics:
 *   accuracy per load level (3, 5, 7)
 *   performance drop (load 3 → 7)
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.memory = (() => {

  // ── Configuration ─────────────────────────────────────────
  const CONFIG = {
    sequenceLengths:    [3, 5, 7],
    trialsPerLength:    3,          // 3 × 3 lengths = 9 trials
    digitDisplayMs:    800,         // ms each digit shown
    digitBlankMs:      200,         // ms blank between digits
    retentionMs:      1500,         // delay before recall
    useInterference:   true,        // show odd/even task during retention
  };

  // Internal state
  let trials       = [];
  let currentIndex = 0;
  let onComplete   = null;
  let dom          = {};

  // Interference state
  let interferenceNumber   = null;
  let interferenceStart    = 0;
  let interferenceResponse = null;

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getInstructions
  // ─────────────────────────────────────────────────────────────
  function getInstructions() {
    return `
      <p>You will see a sequence of digits appear one at a time.
      <strong>Memorize the digits in order.</strong></p>
      <ul>
        <li>Each digit is shown briefly — pay close attention.</li>
        <li>After the sequence, you'll see a short <strong>distractor task</strong>:
            judge whether a number is <em>Odd</em> or <em>Even</em>.</li>
        <li>Press <span class="key">O</span> for Odd, <span class="key">E</span> for Even.</li>
        <li>Then type the digit sequence you saw, in order, and press Submit.</li>
      </ul>
      <div class="warn">⚠ Sequences get longer as the task progresses. Do your best!</div>
      <p>There are <strong>${CONFIG.trialsPerLength * CONFIG.sequenceLengths.length} trials</strong> total across 3 difficulty levels.</p>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // generateTrials
  // Creates a randomized list of trials across all load levels.
  // ─────────────────────────────────────────────────────────────
  function generateTrials() {
    const list = [];

    // Generate digits 0-9, no consecutive repeats
    function randomSequence(length) {
      const seq = [];
      let prev = -1;
      for (let i = 0; i < length; i++) {
        let d;
        do { d = Math.floor(Math.random() * 10); } while (d === prev);
        seq.push(d);
        prev = d;
      }
      return seq;
    }

    // Interleave load levels for progressive difficulty but some mixing
    CONFIG.sequenceLengths.forEach(len => {
      for (let i = 0; i < CONFIG.trialsPerLength; i++) {
        const sequence = randomSequence(len);
        list.push({
          sequenceLength: len,
          sequence,
          condition: `load-${len}`
        });
      }
    });

    // Sort by length ascending (easier to harder, within length randomized)
    // Group by load level but keep load-level order
    return list;
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: init
  // ─────────────────────────────────────────────────────────────
  function init(completionCallback) {
    onComplete = completionCallback;

    dom = {
      area:         document.getElementById('memory-area'),
      display:      document.getElementById('memory-display'),
      inputWrap:    document.getElementById('memory-input-wrap'),
      input:        document.getElementById('memory-input'),
      submitBtn:    document.getElementById('btn-memory-submit'),
      interf:       document.getElementById('interference-task'),
      interfNum:    document.getElementById('interference-number'),
      counter:      document.getElementById('trial-counter'),
      expLabel:     document.getElementById('exp-label'),
      interfBtns:   document.querySelectorAll('[data-val]'),
    };

    trials       = generateTrials();
    currentIndex = 0;

    dom.expLabel.textContent = 'Working Memory';
    dom.area.classList.remove('hidden');

    // Attach submit button
    dom.submitBtn.addEventListener('click', handleRecallSubmit);

    // Attach interference buttons
    dom.interfBtns.forEach(btn => {
      btn.addEventListener('click', () => handleInterferenceResponse(btn.dataset.val));
    });

    // Also allow keyboard for odd/even (O/E) and Enter for recall
    document.addEventListener('keydown', globalKeyHandler);
  }

  // ─────────────────────────────────────────────────────────────
  // globalKeyHandler
  // Handles O/E keys during interference and Enter during recall.
  // ─────────────────────────────────────────────────────────────
  function globalKeyHandler(e) {
    // Interference keys
    if (!dom.interf.classList.contains('hidden')) {
      if (e.key.toLowerCase() === 'o') handleInterferenceResponse('odd');
      if (e.key.toLowerCase() === 'e') handleInterferenceResponse('even');
    }
    // Recall: Enter key submits
    if (!dom.inputWrap.classList.contains('hidden') && e.key === 'Enter') {
      handleRecallSubmit();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: start
  // ─────────────────────────────────────────────────────────────
  function start() {
    runTrial();
  }

  // ─────────────────────────────────────────────────────────────
  // runTrial
  // Displays the digit sequence one digit at a time.
  // ─────────────────────────────────────────────────────────────
  function runTrial() {
    if (currentIndex >= trials.length) {
      endTask();
      return;
    }

    const trial = trials[currentIndex];
    const total = trials.length;

    dom.counter.textContent = `Trial ${currentIndex + 1} / ${total} · Load: ${trial.sequenceLength} digits`;

    // Reset UI
    dom.inputWrap.classList.add('hidden');
    dom.interf.classList.add('hidden');
    dom.input.value = '';
    interferenceResponse = null;

    // Show "READY" briefly
    dom.display.textContent = '···';

    setTimeout(() => {
      presentSequence(trial.sequence, 0);
    }, 600);
  }

  // ─────────────────────────────────────────────────────────────
  // presentSequence
  // Recursively shows each digit in the sequence.
  // ─────────────────────────────────────────────────────────────
  function presentSequence(sequence, index) {
    if (index >= sequence.length) {
      // Sequence done → retention interval
      dom.display.textContent = '';
      startRetentionInterval();
      return;
    }

    // Show digit
    dom.display.textContent = sequence[index];

    setTimeout(() => {
      // Brief blank between digits
      dom.display.textContent = '';
      setTimeout(() => {
        presentSequence(sequence, index + 1);
      }, CONFIG.digitBlankMs);
    }, CONFIG.digitDisplayMs);
  }

  // ─────────────────────────────────────────────────────────────
  // startRetentionInterval
  // Shows interference task (if enabled), then transitions to recall.
  // ─────────────────────────────────────────────────────────────
  function startRetentionInterval() {
    if (CONFIG.useInterference) {
      // Show an odd/even number to judge during retention
      interferenceNumber = Math.floor(Math.random() * 18) + 2; // 2–19
      interferenceStart  = performance.now();
      interferenceResponse = null;

      dom.interfNum.textContent = interferenceNumber;
      dom.interf.classList.remove('hidden');
      dom.display.textContent   = '';

      // Auto-advance to recall after retentionMs regardless of response
      setTimeout(() => {
        dom.interf.classList.add('hidden');
        showRecallPrompt();
      }, CONFIG.retentionMs);
    } else {
      setTimeout(() => {
        showRecallPrompt();
      }, CONFIG.retentionMs);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // handleInterferenceResponse
  // Records odd/even response during retention interval.
  // ─────────────────────────────────────────────────────────────
  function handleInterferenceResponse(val) {
    if (interferenceResponse !== null) return; // already responded
    interferenceResponse = val;
    // Visual feedback on button
    dom.interfBtns.forEach(btn => {
      btn.style.opacity = btn.dataset.val === val ? '1' : '0.4';
    });
    setTimeout(() => {
      dom.interfBtns.forEach(btn => { btn.style.opacity = '1'; });
    }, 400);
  }

  // ─────────────────────────────────────────────────────────────
  // showRecallPrompt
  // Hides sequence display and shows text input for recall.
  // ─────────────────────────────────────────────────────────────
  function showRecallPrompt() {
    dom.display.textContent = '';
    dom.inputWrap.classList.remove('hidden');
    dom.input.focus();
  }

  // ─────────────────────────────────────────────────────────────
  // handleRecallSubmit
  // Evaluates participant's typed response against presented sequence.
  // ─────────────────────────────────────────────────────────────
  function handleRecallSubmit() {
    const trial          = trials[currentIndex];
    const userRaw        = dom.input.value.trim();
    // Normalize: strip spaces, compare digit-by-digit
    const userDigits     = userRaw.replace(/\s+/g, '').replace(/[^0-9]/g, '');
    const presentedStr   = trial.sequence.join('');
    const correct        = userDigits === presentedStr ? 1 : 0;

    // Interference accuracy
    let interfCorrect = -1; // -1 = not applicable
    if (CONFIG.useInterference && interferenceResponse !== null) {
      const isEven = interferenceNumber % 2 === 0;
      interfCorrect = (
        (isEven && interferenceResponse === 'even') ||
        (!isEven && interferenceResponse === 'odd')
      ) ? 1 : 0;
    }

    // ── Log to CEP dataset ──
    CEP.data.logTrial({
      condition:           `load-${trial.sequenceLength}`,
      stimulus:            trial.sequence.join(' '),
      response:            userRaw,
      correct,
      rt_ms:               -1, // recall tasks don't use RT
      // Experiment-specific extras
      sequence_length:     trial.sequenceLength,
      presented_sequence:  presentedStr,
      interference_correct: interfCorrect
    });

    // Visual feedback
    dom.input.style.borderColor = correct ? '#4ec994' : '#e05c5c';
    setTimeout(() => { dom.input.style.borderColor = ''; }, 400);

    currentIndex++;
    setTimeout(() => { runTrial(); }, 500);
  }

  // ─────────────────────────────────────────────────────────────
  // endTask
  // ─────────────────────────────────────────────────────────────
  function endTask() {
    document.removeEventListener('keydown', globalKeyHandler);
    dom.area.classList.add('hidden');
    const metrics = computeMetrics();
    onComplete(metrics);
  }

  // ─────────────────────────────────────────────────────────────
  // computeMetrics
  // ─────────────────────────────────────────────────────────────
  function computeMetrics() {
    const { accuracy } = CEP.data.utils;
    const dataset = CEP.data.getDataset();

    const metrics = [];

    CONFIG.sequenceLengths.forEach(len => {
      const trials = dataset.filter(t => t.sequence_length === len);
      const acc    = accuracy(trials);
      metrics.push({
        label: `Accuracy — ${len}-digit sequences`,
        value: acc !== null ? `${acc}%` : 'N/A',
        unit:  `${trials.length} trials`,
        type:  acc >= 66 ? 'good' : 'warn'
      });
    });

    // Performance drop: load 3 vs load 7
    const load3 = dataset.filter(t => t.sequence_length === 3);
    const load7 = dataset.filter(t => t.sequence_length === 7);
    const acc3  = accuracy(load3) ?? 0;
    const acc7  = accuracy(load7) ?? 0;
    const drop  = parseFloat((acc3 - acc7).toFixed(1));

    metrics.push({
      label: 'Performance Drop (3→7)',
      value: drop >= 0 ? `−${drop}%` : `+${Math.abs(drop)}%`,
      unit:  'accuracy decline with load',
      type:  drop > 30 ? 'warn' : 'highlight'
    });

    metrics.push({
      label: 'Total Trials',
      value: dataset.length,
      unit:  'completed',
      type:  'default'
    });

    return metrics;
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getChartData
  // ─────────────────────────────────────────────────────────────
  function getChartData() {
    const { accuracy } = CEP.data.utils;
    const dataset      = CEP.data.getDataset();

    const values = CONFIG.sequenceLengths.map(len => {
      const t = dataset.filter(d => d.sequence_length === len);
      return accuracy(t) ?? 0;
    });

    return {
      type:    'bar',
      title:   'Accuracy by Sequence Length',
      xLabels: CONFIG.sequenceLengths.map(l => `${l} digits`),
      yValues: values,
      colors:  ['#5b8ef0', '#f5a623', '#e05c5c'],
      yLabel:  'Accuracy (%)'
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
