/**
 * memory.js — Working Memory Task Module  (CEP v2.1)
 * ═══════════════════════════════════════════════════════════
 * Distractor task: single-digit arithmetic (addition OR
 * subtraction), participant types the numeric answer.
 * Must be answered before recall input appears.
 *
 * Extra CSV fields per trial:
 *   interference_problem      — e.g. "7 + 4"
 *   interference_operation    — "addition" | "subtraction"
 *   interference_correct_ans  — correct numeric answer
 *   interference_user_ans     — what the participant typed
 *   interference_correct      — 1 | 0
 *   interference_rt_ms        — ms to answer arithmetic
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.memory = (() => {

  // ── Configuration ──────────────────────────────────────────
  const CONFIG = {
    sequenceLengths:  [3, 5, 7],
    trialsPerLength:  5,           // 5 × 3 = 15 trials total
    digitDisplayMs:   800,
    digitBlankMs:     200,
    announceDuration: 2200,
    useInterference:  true,
  };

  // ── Internal state ─────────────────────────────────────────
  let trials              = [];
  let currentIndex        = 0;
  let onComplete          = null;
  let dom                 = {};
  let currentProblem      = null;
  let interferenceAnswer  = null;
  let interferenceCorrect = -1;
  let interferenceRtMs    = -1;
  let interfStartMs       = 0;

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
        <li>After the sequence, you'll see a quick <strong>arithmetic problem</strong>
            (single-digit addition or subtraction).</li>
        <li>Type your answer and press <span class="key">Enter</span> or click <strong>Submit</strong>.</li>
        <li><strong>You must answer the math problem</strong> before you can recall the sequence.</li>
        <li>Then type the full digit sequence and press Submit.</li>
      </ul>
      <div class="warn-block">⚠ Both tasks matter — your arithmetic accuracy is recorded alongside your recall.</div>
      <p>There are <strong>${total} trials</strong> total — ${CONFIG.trialsPerLength} per level (3 / 5 / 7 digits).</p>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // generateTrials
  // ─────────────────────────────────────────────────────────────
  function generateTrials() {
    const list = [];
    function randomSequence(length) {
      const seq = []; let prev = -1;
      for (let i = 0; i < length; i++) {
        let d;
        do { d = Math.floor(Math.random() * 10); } while (d === prev);
        seq.push(d); prev = d;
      }
      return seq;
    }
    CONFIG.sequenceLengths.forEach(len => {
      for (let i = 0; i < CONFIG.trialsPerLength; i++) {
        list.push({
          sequenceLength: len,
          sequence:       randomSequence(len),
          condition:      `load-${len}`,
          trialInGroup:   i + 1
        });
      }
    });
    return list;
  }

  // ─────────────────────────────────────────────────────────────
  // generateArithmeticProblem
  // Single-digit operands. Subtraction constrained so result >= 0.
  // Returns { a, b, op, answer, problemStr }
  // ─────────────────────────────────────────────────────────────
  function generateArithmeticProblem() {
    const op = Math.random() < 0.5 ? 'addition' : 'subtraction';
    let a, b, answer;
    if (op === 'addition') {
      a = Math.floor(Math.random() * 9) + 1;  // 1-9
      b = Math.floor(Math.random() * 9) + 1;  // 1-9
      answer = a + b;                          // 2-18
    } else {
      a      = Math.floor(Math.random() * 9) + 1; // 1-9
      b      = Math.floor(Math.random() * a) + 1; // 1..a → result 0..a-1
      answer = a - b;
    }
    const symbol     = op === 'addition' ? '+' : '−';
    const problemStr = `${a} ${symbol} ${b}`;
    return { a, b, op, answer, problemStr };
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: init
  // ─────────────────────────────────────────────────────────────
  function init(completionCallback) {
    onComplete = completionCallback;

    dom = {
      area:           document.getElementById('memory-area'),
      display:        document.getElementById('memory-display'),
      announce:       document.getElementById('memory-trial-announce'),
      announceSub:    document.getElementById('announce-sub-text'),
      announceTitle:  document.getElementById('announce-title-text'),
      announceBar:    document.getElementById('announce-bar-fill'),
      interf:         document.getElementById('interference-task'),
      interfEq:       document.getElementById('interference-equation'),
      interfInput:    document.getElementById('interference-input'),
      interfSubmit:   document.getElementById('btn-interference-submit'),
      interfFeedback: document.getElementById('interf-feedback'),
      inputWrap:      document.getElementById('memory-input-wrap'),
      input:          document.getElementById('memory-input'),
      submitBtn:      document.getElementById('btn-memory-submit'),
      counter:        document.getElementById('trial-counter'),
      expLabel:       document.getElementById('exp-label'),
      progFill:       document.getElementById('exp-progress-fill'),
    };

    trials       = generateTrials();
    currentIndex = 0;

    dom.expLabel.textContent = 'Working Memory';
    dom.area.classList.remove('hidden');

    dom.interfSubmit.addEventListener('click', handleInterferenceSubmit);
    dom.submitBtn.addEventListener('click', handleRecallSubmit);
    document.addEventListener('keydown', globalKeyHandler);
  }

  // ─────────────────────────────────────────────────────────────
  // globalKeyHandler
  // ─────────────────────────────────────────────────────────────
  function globalKeyHandler(e) {
    if (!dom.interf.classList.contains('hidden') &&
        interferenceAnswer === null && e.key === 'Enter') {
      handleInterferenceSubmit();
    }
    if (!dom.inputWrap.classList.contains('hidden') && e.key === 'Enter') {
      handleRecallSubmit();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: start
  // ─────────────────────────────────────────────────────────────
  function start() { runTrial(); }

  // ─────────────────────────────────────────────────────────────
  // runTrial
  // ─────────────────────────────────────────────────────────────
  function runTrial() {
    if (currentIndex >= trials.length) { endTask(); return; }

    const trial = trials[currentIndex];
    const total = trials.length;

    dom.progFill.style.width = `${Math.round((currentIndex / total) * 100)}%`;
    dom.counter.textContent  = `Trial ${currentIndex + 1} / ${total}`;

    // Reset all sub-panels
    dom.display.textContent = '';
    dom.inputWrap.classList.add('hidden');
    dom.interf.classList.add('hidden');
    dom.input.value          = '';
    dom.interfInput.value    = '';
    dom.interfInput.disabled  = false;
    dom.interfSubmit.disabled = false;
    dom.interfInput.style.borderColor = '';
    dom.interfFeedback.className = 'interf-feedback hidden';
    dom.interfFeedback.textContent = '';
    interferenceAnswer  = null;
    interferenceCorrect = -1;
    interferenceRtMs    = -1;
    currentProblem      = null;

    // ── Announce banner ──
    dom.announce.classList.remove('hidden');
    dom.announceSub.textContent   = `${trial.sequenceLength}-Digit Sequence · Trial ${trial.trialInGroup} / ${CONFIG.trialsPerLength}`;
    dom.announceTitle.textContent = 'Get Ready';
    dom.announceBar.style.width   = '0%';

    const startTs = performance.now();
    const tickBanner = () => {
      const e = performance.now() - startTs;
      dom.announceBar.style.width = `${Math.min((e / CONFIG.announceDuration) * 100, 100)}%`;
      if (e < CONFIG.announceDuration) requestAnimationFrame(tickBanner);
    };
    requestAnimationFrame(tickBanner);

    setTimeout(() => {
      dom.announce.classList.add('hidden');
      presentSequence(trial.sequence, 0);
    }, CONFIG.announceDuration);
  }

  // ─────────────────────────────────────────────────────────────
  // presentSequence
  // ─────────────────────────────────────────────────────────────
  function presentSequence(sequence, index) {
    if (index >= sequence.length) {
      dom.display.textContent = '';
      startDistractor();
      return;
    }
    dom.display.textContent = sequence[index];
    setTimeout(() => {
      dom.display.textContent = '';
      setTimeout(() => presentSequence(sequence, index + 1), CONFIG.digitBlankMs);
    }, CONFIG.digitDisplayMs);
  }

  // ─────────────────────────────────────────────────────────────
  // startDistractor
  // ─────────────────────────────────────────────────────────────
  function startDistractor() {
    if (!CONFIG.useInterference) { showRecallPrompt(); return; }

    currentProblem = generateArithmeticProblem();
    interfStartMs  = performance.now();

    dom.interfEq.textContent = currentProblem.problemStr;
    dom.interfInput.value    = '';
    dom.interfFeedback.className = 'interf-feedback hidden';
    dom.interf.classList.remove('hidden');

    setTimeout(() => dom.interfInput.focus(), 50);
  }

  // ─────────────────────────────────────────────────────────────
  // handleInterferenceSubmit
  // ─────────────────────────────────────────────────────────────
  function handleInterferenceSubmit() {
    if (interferenceAnswer !== null) return;

    const raw     = dom.interfInput.value.trim();
    const userNum = parseInt(raw, 10);

    if (raw === '' || isNaN(userNum)) {
      dom.interfFeedback.textContent = 'Please enter a number.';
      dom.interfFeedback.className   = 'interf-feedback interf-fb-neutral';
      dom.interfInput.focus();
      return;
    }

    interferenceRtMs    = Math.round(performance.now() - interfStartMs);
    interferenceAnswer  = userNum;
    interferenceCorrect = userNum === currentProblem.answer ? 1 : 0;

    dom.interfInput.disabled  = true;
    dom.interfSubmit.disabled = true;
    dom.interfInput.style.borderColor = interferenceCorrect ? '#34d399' : '#f87171';

    dom.interfFeedback.textContent = interferenceCorrect
      ? `✓  Correct!  (${currentProblem.answer})`
      : `✗  Answer was ${currentProblem.answer}`;
    dom.interfFeedback.className = interferenceCorrect
      ? 'interf-feedback interf-fb-correct'
      : 'interf-feedback interf-fb-wrong';

    setTimeout(() => {
      dom.interf.classList.add('hidden');
      showRecallPrompt();
    }, 900);
  }

  // ─────────────────────────────────────────────────────────────
  // showRecallPrompt
  // ─────────────────────────────────────────────────────────────
  function showRecallPrompt() {
    dom.display.textContent = '';
    dom.inputWrap.classList.remove('hidden');
    setTimeout(() => dom.input.focus(), 50);
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
      condition:                trial.condition,
      stimulus:                 trial.sequence.join(' '),
      response:                 userRaw,
      correct,
      rt_ms:                    -1,
      sequence_length:          trial.sequenceLength,
      presented_sequence:       presentedStr,
      trial_in_group:           trial.trialInGroup,
      interference_problem:     currentProblem ? currentProblem.problemStr : 'N/A',
      interference_operation:   currentProblem ? currentProblem.op : 'N/A',
      interference_correct_ans: currentProblem ? currentProblem.answer : -1,
      interference_user_ans:    interferenceAnswer  ?? -1,
      interference_correct:     interferenceCorrect,
      interference_rt_ms:       interferenceRtMs
    });

    dom.input.style.borderColor = correct ? '#34d399' : '#f87171';
    setTimeout(() => { dom.input.style.borderColor = ''; }, 400);

    currentIndex++;
    setTimeout(runTrial, 600);
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
    const { accuracy, mean } = CEP.data.utils;
    const dataset = CEP.data.getDataset();
    const metrics = [];

    // Recall accuracy per load
    CONFIG.sequenceLengths.forEach(len => {
      const t   = dataset.filter(d => d.sequence_length === len);
      const acc = accuracy(t);
      metrics.push({
        label: `Recall — ${len}-Digit`,
        value: acc !== null ? `${acc}%` : 'N/A',
        unit:  `${t.length} trials`,
        type:  acc >= 60 ? 'good' : 'warn'
      });
    });

    // Load effect
    const acc3 = accuracy(dataset.filter(t => t.sequence_length === 3)) ?? 0;
    const acc7 = accuracy(dataset.filter(t => t.sequence_length === 7)) ?? 0;
    const drop = parseFloat((acc3 - acc7).toFixed(1));
    metrics.push({
      label: 'Load Effect (3→7)',
      value: drop >= 0 ? `−${drop}%` : `+${Math.abs(drop)}%`,
      unit:  'recall drop across load levels',
      type:  drop > 30 ? 'warn' : 'highlight'
    });

    // Overall distractor accuracy
    const dTrials = dataset.filter(t => t.interference_correct !== -1);
    const dAcc    = dTrials.length
      ? parseFloat((dTrials.filter(t => t.interference_correct === 1).length / dTrials.length * 100).toFixed(1))
      : null;
    metrics.push({
      label: 'Distractor Accuracy',
      value: dAcc !== null ? `${dAcc}%` : 'N/A',
      unit:  `${dTrials.length} arithmetic problems`,
      type:  dAcc >= 75 ? 'good' : 'warn'
    });

    // Mean distractor RT
    const dRTs    = dTrials.map(t => t.interference_rt_ms).filter(v => v > 0);
    const meanDRt = mean(dRTs);
    metrics.push({
      label: 'Mean Distractor RT',
      value: meanDRt ? `${Math.round(meanDRt)}` : 'N/A',
      unit:  'ms to solve arithmetic',
      type:  'default'
    });

    // Addition vs Subtraction accuracy
    const addTrials = dTrials.filter(t => t.interference_operation === 'addition');
    const subTrials = dTrials.filter(t => t.interference_operation === 'subtraction');
    const addAcc = addTrials.length
      ? parseFloat((addTrials.filter(t => t.interference_correct === 1).length / addTrials.length * 100).toFixed(1))
      : null;
    const subAcc = subTrials.length
      ? parseFloat((subTrials.filter(t => t.interference_correct === 1).length / subTrials.length * 100).toFixed(1))
      : null;
    if (addAcc !== null) metrics.push({
      label: 'Addition Accuracy',
      value: `${addAcc}%`,
      unit:  `${addTrials.length} problems`,
      type:  addAcc >= 80 ? 'good' : 'warn'
    });
    if (subAcc !== null) metrics.push({
      label: 'Subtraction Accuracy',
      value: `${subAcc}%`,
      unit:  `${subTrials.length} problems`,
      type:  subAcc >= 80 ? 'good' : 'warn'
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
  // PUBLIC: getChartData — grouped bars: recall + distractor
  // ─────────────────────────────────────────────────────────────
  function getChartData() {
    const { accuracy } = CEP.data.utils;
    const dataset = CEP.data.getDataset();

    return {
      type:    'grouped-bar',
      title:   'Recall vs Distractor Accuracy by Load',
      xLabels: CONFIG.sequenceLengths.map(l => `${l} digits`),
      seriesA: {
        name:   'Recall',
        values: CONFIG.sequenceLengths.map(len =>
          accuracy(dataset.filter(d => d.sequence_length === len)) ?? 0),
        color: '#6366f1'
      },
      seriesB: {
        name:   'Distractor',
        values: CONFIG.sequenceLengths.map(len => {
          const t = dataset.filter(d => d.sequence_length === len && d.interference_correct !== -1);
          return t.length
            ? parseFloat((t.filter(d => d.interference_correct === 1).length / t.length * 100).toFixed(1))
            : 0;
        }),
        color: '#2dd4bf'
      },
      yLabel: 'Accuracy (%)'
    };
  }

  return { getInstructions, init, start, getChartData };

})();
