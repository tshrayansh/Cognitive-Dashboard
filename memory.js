/**
 * memory.js — Working Memory Task Module  (CEP v2)
 * ═══════════════════════════════════════════════════════════
 * Changes from v1:
 *   · 5 trials per sequence length (was 3) → 15 total
 *   · Trial announce banner shown before each trial
 *     (e.g. "Trial 2 / 5  ·  5-Digit Sequence")
 *   · Interference (odd/even) MUST be answered before
 *     the recall input appears — no auto-timeout bypass
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.memory = (() => {

  // ── Configuration ─────────────────────────────────────────
  const CONFIG = {
    sequenceLengths:  [3, 5, 7],
    trialsPerLength:  5,           // 5 × 3 = 15 trials total
    digitDisplayMs:   800,
    digitBlankMs:     200,
    announceDuration: 2200,        // ms to show the trial banner
    useInterference:  true,
  };

  // Internal state
  let trials             = [];
  let currentIndex       = 0;
  let onComplete         = null;
  let dom                = {};
  let interferenceNumber = null;
  let interferenceAnswer = null;   // null = not yet answered
  let interferenceCorrect = -1;
  let announceTimer      = null;

  // Track trial-within-length index for per-group labeling
  // e.g. "Trial 2 / 5" within the 5-digit group
  let lengthCounters = { 3: 0, 5: 0, 7: 0 };

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getInstructions
  // ─────────────────────────────────────────────────────────────
  function getInstructions() {
    const total = CONFIG.trialsPerLength * CONFIG.sequenceLengths.length;
    return `
      <p>You will see a sequence of digits appear one at a time.
      <strong>Memorize the digits in order.</strong></p>
      <ul>
        <li>Each digit flashes briefly — stay focused.</li>
        <li>After the sequence disappears, you'll face a quick <strong>distractor question</strong>:
            judge whether a number is <em>Odd</em> or <em>Even</em>.</li>
        <li>Press <span class="key">O</span> for Odd — <span class="key">E</span> for Even.</li>
        <li><strong>You must answer the distractor</strong> before the recall input appears.</li>
        <li>Then type the digit sequence you saw and press Submit.</li>
      </ul>
      <div class="warn-block">⚠ Sequences get longer across the three blocks. Do your best at every level.</div>
      <p>There are <strong>${total} trials</strong> total — ${CONFIG.trialsPerLength} per difficulty level.</p>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // generateTrials — 5 trials each for lengths 3, 5, 7
  // ─────────────────────────────────────────────────────────────
  function generateTrials() {
    const list = [];
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
    // Groups in order of increasing difficulty
    CONFIG.sequenceLengths.forEach(len => {
      for (let i = 0; i < CONFIG.trialsPerLength; i++) {
        list.push({
          sequenceLength: len,
          sequence:       randomSequence(len),
          condition:      `load-${len}`,
          trialInGroup:   i + 1   // 1-indexed within this length group
        });
      }
    });
    return list; // already ordered 3→5→7
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: init
  // ─────────────────────────────────────────────────────────────
  function init(completionCallback) {
    onComplete = completionCallback;

    dom = {
      area:          document.getElementById('memory-area'),
      display:       document.getElementById('memory-display'),
      announce:      document.getElementById('memory-trial-announce'),
      announceSub:   document.getElementById('announce-sub-text'),
      announceTitle: document.getElementById('announce-title-text'),
      announceBar:   document.getElementById('announce-bar-fill'),
      inputWrap:     document.getElementById('memory-input-wrap'),
      input:         document.getElementById('memory-input'),
      submitBtn:     document.getElementById('btn-memory-submit'),
      interf:        document.getElementById('interference-task'),
      interfNum:     document.getElementById('interference-number'),
      counter:       document.getElementById('trial-counter'),
      expLabel:      document.getElementById('exp-label'),
      progFill:      document.getElementById('exp-progress-fill'),
      interfBtns:    document.querySelectorAll('.interf-btn'),
    };

    trials         = generateTrials();
    currentIndex   = 0;
    lengthCounters = { 3: 0, 5: 0, 7: 0 };

    dom.expLabel.textContent = 'Working Memory';
    dom.area.classList.remove('hidden');

    dom.submitBtn.addEventListener('click', handleRecallSubmit);
    dom.interfBtns.forEach(btn => {
      btn.addEventListener('click', () => handleInterferenceResponse(btn.dataset.val));
    });
    document.addEventListener('keydown', globalKeyHandler);
  }

  // ─────────────────────────────────────────────────────────────
  // globalKeyHandler — O/E during interference, Enter during recall
  // ─────────────────────────────────────────────────────────────
  function globalKeyHandler(e) {
    if (!dom.interf.classList.contains('hidden') && interferenceAnswer === null) {
      if (e.key.toLowerCase() === 'o') handleInterferenceResponse('odd');
      if (e.key.toLowerCase() === 'e') handleInterferenceResponse('even');
    }
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
  // runTrial — show announce banner, then begin sequence
  // ─────────────────────────────────────────────────────────────
  function runTrial() {
    if (currentIndex >= trials.length) {
      endTask();
      return;
    }

    const trial = trials[currentIndex];
    const total = trials.length;
    const pct   = Math.round((currentIndex / total) * 100);

    // Update progress bar and counter
    dom.progFill.style.width  = `${pct}%`;
    dom.counter.textContent   = `Trial ${currentIndex + 1} / ${total}`;

    // Reset all sub-panels
    dom.display.textContent = '';
    dom.inputWrap.classList.add('hidden');
    dom.interf.classList.add('hidden');
    dom.input.value = '';
    interferenceAnswer  = null;
    interferenceCorrect = -1;

    // ── Show trial announce banner ──
    dom.announce.classList.remove('hidden');
    dom.announceSub.textContent   = `${trial.sequenceLength}-Digit Sequence · Trial ${trial.trialInGroup} / ${CONFIG.trialsPerLength}`;
    dom.announceTitle.textContent = `Get Ready`;
    dom.announceBar.style.width   = '0%';

    // Animate the progress bar across the announce duration
    const startTs = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startTs;
      const pctFill = Math.min((elapsed / CONFIG.announceDuration) * 100, 100);
      dom.announceBar.style.width = `${pctFill}%`;
      if (elapsed < CONFIG.announceDuration) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);

    // After banner → start sequence
    announceTimer = setTimeout(() => {
      dom.announce.classList.add('hidden');
      dom.display.textContent = '';
      presentSequence(trial.sequence, 0);
    }, CONFIG.announceDuration);
  }

  // ─────────────────────────────────────────────────────────────
  // presentSequence — flash digits one by one
  // ─────────────────────────────────────────────────────────────
  function presentSequence(sequence, index) {
    if (index >= sequence.length) {
      dom.display.textContent = '';
      startRetentionInterval();
      return;
    }
    dom.display.textContent = sequence[index];
    setTimeout(() => {
      dom.display.textContent = '';
      setTimeout(() => presentSequence(sequence, index + 1), CONFIG.digitBlankMs);
    }, CONFIG.digitDisplayMs);
  }

  // ─────────────────────────────────────────────────────────────
  // startRetentionInterval — show interference if enabled
  // ─────────────────────────────────────────────────────────────
  function startRetentionInterval() {
    if (CONFIG.useInterference) {
      interferenceNumber = Math.floor(Math.random() * 18) + 2; // 2–19
      interferenceAnswer = null;
      dom.interfNum.textContent = interferenceNumber;

      // Reset button states
      dom.interfBtns.forEach(btn => {
        btn.classList.remove('answered');
        btn.style.opacity = '1';
      });

      dom.interf.classList.remove('hidden');
      // Recall will NOT show until handleInterferenceResponse is called
    } else {
      showRecallPrompt();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // handleInterferenceResponse — MUST be answered to proceed
  // ─────────────────────────────────────────────────────────────
  function handleInterferenceResponse(val) {
    if (interferenceAnswer !== null) return; // already answered
    interferenceAnswer = val;

    const isEven = interferenceNumber % 2 === 0;
    interferenceCorrect = (
      (isEven && val === 'even') || (!isEven && val === 'odd')
    ) ? 1 : 0;

    // Visual feedback on chosen button
    dom.interfBtns.forEach(btn => {
      if (btn.dataset.val === val) {
        btn.classList.add('answered');
      } else {
        btn.style.opacity = '0.35';
      }
    });

    // Short pause so user sees their selection, then proceed to recall
    setTimeout(() => {
      dom.interf.classList.add('hidden');
      showRecallPrompt();
    }, 450);
  }

  // ─────────────────────────────────────────────────────────────
  // showRecallPrompt
  // ─────────────────────────────────────────────────────────────
  function showRecallPrompt() {
    dom.display.textContent = '';
    dom.inputWrap.classList.remove('hidden');
    dom.input.focus();
  }

  // ─────────────────────────────────────────────────────────────
  // handleRecallSubmit
  // ─────────────────────────────────────────────────────────────
  function handleRecallSubmit() {
    const trial        = trials[currentIndex];
    const userRaw      = dom.input.value.trim();
    const userDigits   = userRaw.replace(/\s+/g, '').replace(/[^0-9]/g, '');
    const presentedStr = trial.sequence.join('');
    const correct      = userDigits === presentedStr ? 1 : 0;

    CEP.data.logTrial({
      condition:             trial.condition,
      stimulus:              trial.sequence.join(' '),
      response:              userRaw,
      correct,
      rt_ms:                 -1,
      sequence_length:       trial.sequenceLength,
      presented_sequence:    presentedStr,
      trial_in_group:        trial.trialInGroup,
      interference_response: interferenceAnswer  ?? 'none',
      interference_correct:  interferenceCorrect
    });

    // Brief input flash
    dom.input.style.borderColor = correct ? '#34d399' : '#f87171';
    setTimeout(() => { dom.input.style.borderColor = ''; }, 400);

    currentIndex++;
    setTimeout(runTrial, 550);
  }

  // ─────────────────────────────────────────────────────────────
  // endTask
  // ─────────────────────────────────────────────────────────────
  function endTask() {
    document.removeEventListener('keydown', globalKeyHandler);
    dom.area.classList.add('hidden');
    dom.progFill.style.width = '100%';
    onComplete(computeMetrics());
  }

  // ─────────────────────────────────────────────────────────────
  // computeMetrics
  // ─────────────────────────────────────────────────────────────
  function computeMetrics() {
    const { accuracy } = CEP.data.utils;
    const dataset = CEP.data.getDataset();
    const metrics = [];

    CONFIG.sequenceLengths.forEach(len => {
      const t   = dataset.filter(d => d.sequence_length === len);
      const acc = accuracy(t);
      metrics.push({
        label: `Accuracy — ${len}-Digit`,
        value: acc !== null ? `${acc}%` : 'N/A',
        unit:  `${t.length} trials`,
        type:  acc >= 60 ? 'good' : 'warn'
      });
    });

    const load3 = dataset.filter(t => t.sequence_length === 3);
    const load7 = dataset.filter(t => t.sequence_length === 7);
    const drop  = parseFloat(((accuracy(load3) ?? 0) - (accuracy(load7) ?? 0)).toFixed(1));

    metrics.push({
      label: 'Performance Drop (3→7)',
      value: drop >= 0 ? `−${drop}%` : `+${Math.abs(drop)}%`,
      unit:  'accuracy decline across load',
      type:  drop > 30 ? 'warn' : 'highlight'
    });

    // Interference accuracy
    const interfTrials = dataset.filter(t => t.interference_correct !== -1);
    const interfAcc    = accuracy(interfTrials);
    metrics.push({
      label: 'Distractor Accuracy',
      value: interfAcc !== null ? `${interfAcc}%` : 'N/A',
      unit:  'odd/even task',
      type:  'default'
    });

    metrics.push({
      label: 'Total Trials',
      value: dataset.length,
      unit: 'completed',
      type: 'default'
    });

    return metrics;
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getChartData
  // ─────────────────────────────────────────────────────────────
  function getChartData() {
    const { accuracy } = CEP.data.utils;
    const dataset      = CEP.data.getDataset();
    return {
      type:    'bar',
      title:   'Recall Accuracy by Sequence Length',
      xLabels: CONFIG.sequenceLengths.map(l => `${l} digits`),
      yValues: CONFIG.sequenceLengths.map(len => {
        const t = dataset.filter(d => d.sequence_length === len);
        return accuracy(t) ?? 0;
      }),
      colors:  ['#6366f1', '#f59e0b', '#f87171'],
      yLabel:  'Accuracy (%)'
    };
  }

  return { getInstructions, init, start, getChartData };

})();
