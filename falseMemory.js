/**
 * falseMemory.js — False Memory Task (DRM-lite) Module
 * ═══════════════════════════════════════════════════════════
 * Implements a simplified Deese-Roediger-McDermott paradigm.
 *
 * Design:
 *   - 3 semantic word lists, each associated with a critical lure
 *   - Study phase: present 8 words per list (excluding the lure)
 *   - Each word shown for 1.5s with a progress bar
 *   - Short distractor (count-down) between study and recognition
 *   - Recognition phase: 40 test words — mix of:
 *       · studied words (targets)      → correct "YES"
 *       · critical lures (never seen)  → correct "NO"
 *       · unrelated foils              → correct "NO"
 *
 * Logged fields (in addition to core CEP schema):
 *   word_type    : "target" | "lure" | "foil"
 *   lure         : 1 if this is a critical lure, else 0
 *   list_theme   : the semantic category label
 *
 * Computed metrics:
 *   true_recall_rate   : % of targets correctly recognized
 *   false_recall_rate  : % of lures incorrectly called "YES"
 *   foil_rejection     : % of foils correctly called "NO"
 *   intrusion_rate     : false positives as % of non-target trials
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.falseMemory = (() => {

  // ── Stimulus Materials ────────────────────────────────────────
  // Three DRM-style lists. The critical lure is NEVER presented
  // during the study phase but is included in recognition.
  const LISTS = [
    {
      theme:        'SLEEP',
      criticalLure: 'sleep',
      studyWords:   ['bed', 'rest', 'awake', 'tired', 'dream', 'night', 'snore', 'pillow'],
    },
    {
      theme:        'DOCTOR',
      criticalLure: 'doctor',
      studyWords:   ['nurse', 'sick', 'hospital', 'medicine', 'health', 'stethoscope', 'patient', 'surgery'],
    },
    {
      theme:        'MUSIC',
      criticalLure: 'music',
      studyWords:   ['note', 'piano', 'song', 'melody', 'rhythm', 'concert', 'instrument', 'choir'],
    }
  ];

  // Unrelated foils for recognition phase
  const FOILS = [
    'table', 'pencil', 'window', 'carpet', 'bicycle', 'cloud',
    'hammer', 'river', 'candle', 'jacket', 'mirror', 'garden'
  ];

  // Configuration
  const CONFIG = {
    studyWordDurationMs: 1500,   // ms each study word shown
    distractorCountFrom:    5,   // countdown seconds between study/recognition
  };

  // Internal state
  let studySequence    = [];   // all words to show during study
  let recognitionTests = [];   // all test items during recognition
  let studyIndex       = 0;
  let testIndex        = 0;
  let onComplete       = null;
  let dom              = {};
  let studyTimer       = null;

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getInstructions
  // ─────────────────────────────────────────────────────────────
  function getInstructions() {
    const totalStudy = LISTS.reduce((n, l) => n + l.studyWords.length, 0);
    const totalTest  = totalStudy + LISTS.length + FOILS.length;
    return `
      <p>This task studies how memory works under semantic similarity.</p>
      <ul>
        <li><strong>Study phase:</strong> You will see <strong>${totalStudy} words</strong> appear one at a time.
            Pay close attention — try to memorize each word.</li>
        <li>After a short distractor, you will reach the <strong>recognition phase</strong>.</li>
        <li>For each word shown, press <span class="key">Y</span> if you saw it earlier,
            or <span class="key">N</span> if you did NOT.</li>
        <li>Some words may feel familiar — trust your memory carefully.</li>
      </ul>
      <div class="warn">⚠ Be cautious: some words are <em>semantically related</em> to what you studied, but were never actually shown.</div>
      <p><strong>${totalTest} recognition trials</strong> total.</p>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // buildStudySequence
  // Interleave all study words from all lists in one flat array.
  // ─────────────────────────────────────────────────────────────
  function buildStudySequence() {
    const seq = [];
    LISTS.forEach(list => {
      list.studyWords.forEach(word => {
        seq.push({ word, theme: list.theme });
      });
    });
    // Shuffle
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
    return seq;
  }

  // ─────────────────────────────────────────────────────────────
  // buildRecognitionTests
  // Creates the recognition test list: targets + lures + foils.
  // ─────────────────────────────────────────────────────────────
  function buildRecognitionTests() {
    const tests = [];

    // ── Targets: studied words (correct answer = YES) ──
    LISTS.forEach(list => {
      list.studyWords.forEach(word => {
        tests.push({
          word,
          wordType:   'target',
          lure:        0,
          listTheme:   list.theme,
          correctResponse: 'yes'
        });
      });
    });

    // ── Critical lures: never seen (correct answer = NO) ──
    LISTS.forEach(list => {
      tests.push({
        word:            list.criticalLure,
        wordType:        'lure',
        lure:            1,
        listTheme:       list.theme,
        correctResponse: 'no'
      });
    });

    // ── Foils: unrelated words (correct answer = NO) ──
    FOILS.forEach(word => {
      tests.push({
        word,
        wordType:        'foil',
        lure:            0,
        listTheme:       'none',
        correctResponse: 'no'
      });
    });

    // Shuffle
    for (let i = tests.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tests[i], tests[j]] = [tests[j], tests[i]];
    }
    return tests;
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: init
  // ─────────────────────────────────────────────────────────────
  function init(completionCallback) {
    onComplete = completionCallback;

    dom = {
      area:          document.getElementById('false-memory-area'),
      studyPhase:    document.getElementById('fm-study-phase'),
      recogPhase:    document.getElementById('fm-recognition-phase'),
      wordDisplay:   document.getElementById('fm-word-display'),
      progressFill:  document.getElementById('fm-progress-fill'),
      testWord:      document.getElementById('fm-test-word'),
      btnYes:        document.getElementById('btn-fm-yes'),
      btnNo:         document.getElementById('btn-fm-no'),
      counter:       document.getElementById('trial-counter'),
      expLabel:      document.getElementById('exp-label'),
    };

    studySequence    = buildStudySequence();
    recognitionTests = buildRecognitionTests();
    studyIndex       = 0;
    testIndex        = 0;

    dom.expLabel.textContent = 'False Memory Task';
    dom.area.classList.remove('hidden');

    // Attach yes/no buttons
    dom.btnYes.addEventListener('click', () => handleRecognitionResponse('yes'));
    dom.btnNo.addEventListener('click',  () => handleRecognitionResponse('no'));

    // Y/N keyboard support during recognition
    document.addEventListener('keydown', globalKeyHandler);
  }

  function globalKeyHandler(e) {
    if (dom.recogPhase.classList.contains('hidden')) return;
    if (e.key.toLowerCase() === 'y') handleRecognitionResponse('yes');
    if (e.key.toLowerCase() === 'n') handleRecognitionResponse('no');
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: start
  // ─────────────────────────────────────────────────────────────
  function start() {
    dom.studyPhase.classList.remove('hidden');
    dom.recogPhase.classList.add('hidden');
    runStudyWord();
  }

  // ─────────────────────────────────────────────────────────────
  // runStudyWord
  // Presents each study word one at a time with a progress bar.
  // ─────────────────────────────────────────────────────────────
  function runStudyWord() {
    if (studyIndex >= studySequence.length) {
      startDistractor();
      return;
    }

    const item  = studySequence[studyIndex];
    const total = studySequence.length;
    const pct   = Math.round((studyIndex / total) * 100);

    dom.counter.textContent        = `Study: ${studyIndex + 1} / ${total}`;
    dom.wordDisplay.textContent    = item.word.toUpperCase();
    dom.progressFill.style.width   = `${pct}%`;

    studyIndex++;
    studyTimer = setTimeout(runStudyWord, CONFIG.studyWordDurationMs);
  }

  // ─────────────────────────────────────────────────────────────
  // startDistractor
  // Brief countdown between study and recognition phases.
  // ─────────────────────────────────────────────────────────────
  function startDistractor() {
    dom.progressFill.style.width = '100%';
    dom.wordDisplay.textContent  = '';

    let count = CONFIG.distractorCountFrom;
    dom.counter.textContent = 'Recognition starting in…';

    const tick = () => {
      dom.wordDisplay.textContent = count > 0 ? count : '—';
      if (count <= 0) {
        startRecognitionPhase();
        return;
      }
      count--;
      setTimeout(tick, 1000);
    };
    tick();
  }

  // ─────────────────────────────────────────────────────────────
  // startRecognitionPhase
  // Switches the UI to recognition mode.
  // ─────────────────────────────────────────────────────────────
  function startRecognitionPhase() {
    dom.studyPhase.classList.add('hidden');
    dom.recogPhase.classList.remove('hidden');
    testIndex = 0;
    runRecognitionTrial();
  }

  // ─────────────────────────────────────────────────────────────
  // runRecognitionTrial
  // Shows the next test word and waits for YES/NO response.
  // ─────────────────────────────────────────────────────────────
  function runRecognitionTrial() {
    if (testIndex >= recognitionTests.length) {
      endTask();
      return;
    }

    const item  = recognitionTests[testIndex];
    const total = recognitionTests.length;

    dom.counter.textContent  = `Recognition: ${testIndex + 1} / ${total}`;
    dom.testWord.textContent = item.word.toUpperCase();

    // Reset button states
    dom.btnYes.style.opacity = '1';
    dom.btnNo.style.opacity  = '1';
  }

  // ─────────────────────────────────────────────────────────────
  // handleRecognitionResponse
  // Records a YES/NO response and advances to next trial.
  // ─────────────────────────────────────────────────────────────
  function handleRecognitionResponse(response) {
    const item    = recognitionTests[testIndex];
    const correct = response === item.correctResponse ? 1 : 0;

    // ── Log to CEP dataset ──
    CEP.data.logTrial({
      condition:  item.wordType,           // "target" | "lure" | "foil"
      stimulus:   item.word,
      response,                             // "yes" | "no"
      correct,
      rt_ms:      -1,
      // Experiment-specific extras
      word_type:  item.wordType,
      lure:       item.lure,
      list_theme: item.listTheme,
      correct_response: item.correctResponse
    });

    // Brief visual feedback
    dom.btnYes.style.opacity = response === 'yes' ? '1' : '0.35';
    dom.btnNo.style.opacity  = response === 'no'  ? '1' : '0.35';

    testIndex++;
    setTimeout(() => { runRecognitionTrial(); }, 350);
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
    const dataset      = CEP.data.getDataset();

    const targets = dataset.filter(t => t.word_type === 'target');
    const lures   = dataset.filter(t => t.word_type === 'lure');
    const foils   = dataset.filter(t => t.word_type === 'foil');

    // True recall rate: % of targets correctly said YES
    const trueRecall = accuracy(targets);

    // False recall rate: % of lures incorrectly said YES
    // (These were never presented — saying YES is an error)
    const lureFalseAlarms = lures.filter(t => t.response === 'yes').length;
    const falseRecallRate = lures.length > 0
      ? parseFloat(((lureFalseAlarms / lures.length) * 100).toFixed(1))
      : null;

    // Foil rejection: % of foils correctly said NO
    const foilRejection = accuracy(foils);

    // Intrusion rate: false positives (said YES when shouldn't) / all non-target trials
    const nonTargets  = [...lures, ...foils];
    const intrusions  = nonTargets.filter(t => t.response === 'yes').length;
    const intrusionRate = nonTargets.length > 0
      ? parseFloat(((intrusions / nonTargets.length) * 100).toFixed(1))
      : null;

    return [
      {
        label: 'True Recall Rate',
        value: trueRecall !== null ? `${trueRecall}%` : 'N/A',
        unit:  `${targets.length} targets`,
        type:  trueRecall >= 70 ? 'good' : 'warn'
      },
      {
        label: 'False Recall (Lures)',
        value: falseRecallRate !== null ? `${falseRecallRate}%` : 'N/A',
        unit:  `${lures.length} critical lures`,
        type:  falseRecallRate > 40 ? 'warn' : 'good'
      },
      {
        label: 'Foil Rejection Rate',
        value: foilRejection !== null ? `${foilRejection}%` : 'N/A',
        unit:  `${foils.length} unrelated foils`,
        type:  foilRejection >= 80 ? 'good' : 'warn'
      },
      {
        label: 'Intrusion Rate',
        value: intrusionRate !== null ? `${intrusionRate}%` : 'N/A',
        unit:  'false positives / all non-targets',
        type:  intrusionRate > 30 ? 'warn' : 'highlight'
      },
      {
        label: 'Total Recognition',
        value: dataset.length,
        unit:  'trials',
        type:  'default'
      }
    ];
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: getChartData
  // ─────────────────────────────────────────────────────────────
  function getChartData() {
    const { accuracy } = CEP.data.utils;
    const dataset = CEP.data.getDataset();

    const targets = dataset.filter(t => t.word_type === 'target');
    const lures   = dataset.filter(t => t.word_type === 'lure');
    const foils   = dataset.filter(t => t.word_type === 'foil');

    // For lures, "accuracy" means saying NO (correct response)
    const lureFalseAlarms = lures.length > 0
      ? parseFloat(((lures.filter(t => t.response === 'yes').length / lures.length) * 100).toFixed(1))
      : 0;

    return {
      type:    'bar',
      title:   'Recognition Performance by Word Type',
      xLabels: ['Targets\n(True Recall)', 'Lures\n(False Alarm)', 'Foils\n(Correct Rejection)'],
      yValues: [
        accuracy(targets) ?? 0,
        lureFalseAlarms,
        accuracy(foils)   ?? 0
      ],
      colors:  ['#4ec994', '#e05c5c', '#5b8ef0'],
      yLabel:  'Response Rate (%)'
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
