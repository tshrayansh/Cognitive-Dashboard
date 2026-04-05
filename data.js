/**
 * data.js — Central Data Logging Module
 * ═══════════════════════════════════════════════════════════
 * Single source of truth for all trial-level behavioral data.
 * All experiment modules push to `CEP.data.dataset`.
 *
 * Dataset schema (each row is one trial):
 *   participant_id  : string  — participant identifier
 *   experiment      : string  — "stroop" | "memory" | "falsememory"
 *   trial_number    : number  — 1-indexed trial count
 *   condition       : string  — experiment-specific condition label
 *   stimulus        : string  — what was shown
 *   response        : string  — what the participant responded
 *   correct         : 0 | 1   — response accuracy
 *   rt_ms           : number  — reaction time in milliseconds (-1 if N/A)
 *   timestamp       : string  — ISO datetime of trial
 *   [extra fields]  : any     — per-experiment additional fields
 * ═══════════════════════════════════════════════════════════
 */

// Namespace everything under a global CEP object
window.CEP = window.CEP || {};

CEP.data = (() => {

  /** Master dataset array — every trial in every experiment */
  let dataset = [];

  /** Current session metadata */
  let session = {
    participantId: null,
    experiment: null,
    startTime: null
  };

  /**
   * initSession
   * Called once at experiment start. Clears previous data.
   * @param {string} participantId
   * @param {string} experiment
   */
  function initSession(participantId, experiment) {
    dataset = [];
    session = {
      participantId,
      experiment,
      startTime: new Date().toISOString()
    };
    console.log(`[CEP] Session started | PID: ${participantId} | Exp: ${experiment}`);
  }

  /**
   * logTrial
   * Push one trial's data to the dataset.
   * Automatically stamps participant_id, experiment, and timestamp.
   * @param {Object} trialData — trial fields (see schema above)
   */
  function logTrial(trialData) {
    const row = {
      participant_id: session.participantId,
      experiment:     session.experiment,
      trial_number:   dataset.length + 1,
      condition:      trialData.condition   ?? '',
      stimulus:       trialData.stimulus    ?? '',
      response:       trialData.response    ?? '',
      correct:        trialData.correct     ?? 0,
      rt_ms:          trialData.rt_ms       ?? -1,
      timestamp:      new Date().toISOString(),
      // Spread any additional fields last so they don't overwrite core fields
      ...trialData
    };
    dataset.push(row);
    console.log(`[CEP] Trial ${row.trial_number} logged`, row);
    return row;
  }

  /**
   * getDataset
   * Returns a shallow copy of the dataset array.
   */
  function getDataset() {
    return [...dataset];
  }

  /**
   * getSession
   * Returns current session metadata.
   */
  function getSession() {
    return { ...session };
  }

  /**
   * getTrialCount
   * Returns the number of logged trials in the current session.
   */
  function getTrialCount() {
    return dataset.length;
  }

  /**
   * filterBy
   * Returns trials matching a field/value pair.
   * @param {string} field
   * @param {any}    value
   */
  function filterBy(field, value) {
    return dataset.filter(row => row[field] === value);
  }

  /**
   * mean
   * Utility: compute mean of a numeric array. Returns null if empty.
   * @param {number[]} arr
   */
  function mean(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * accuracy
   * Utility: compute proportion correct from a trial array.
   * @param {Object[]} trials
   */
  function accuracy(trials) {
    if (!trials || trials.length === 0) return null;
    const correct = trials.filter(t => t.correct === 1).length;
    return parseFloat(((correct / trials.length) * 100).toFixed(1));
  }

  // Public API
  return {
    initSession,
    logTrial,
    getDataset,
    getSession,
    getTrialCount,
    filterBy,
    // Utility math helpers exposed for experiment modules
    utils: { mean, accuracy }
  };

})();
