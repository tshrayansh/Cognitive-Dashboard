/**
 * data.js — Central Data Logging Module  (CEP v2)
 * ═══════════════════════════════════════════════════════════
 * Central dataset array + session metadata including participant
 * demographics (gender, age, major, sleep hours).
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.data = (() => {

  let dataset = [];

  let session = {
    participantId: null,
    experiment:    null,
    gender:        null,
    age:           null,
    major:         null,
    sleepHours:    null,
    startTime:     null
  };

  /**
   * initSession — call once at experiment start.
   * @param {Object} info — { participantId, experiment, gender, age, major, sleepHours }
   */
  function initSession(info) {
    dataset = [];
    session = {
      participantId: info.participantId,
      experiment:    info.experiment,
      gender:        info.gender        ?? null,
      age:           info.age           ?? null,
      major:         info.major         ?? null,
      sleepHours:    info.sleepHours    ?? null,
      startTime:     new Date().toISOString()
    };
    console.log('[CEP] Session started', session);
  }

  /**
   * logTrial — push one trial to dataset.
   * Core fields are auto-stamped; pass experiment-specific fields in trialData.
   */
  function logTrial(trialData) {
    const row = {
      // ── Participant demographics ──
      participant_id: session.participantId,
      gender:         session.gender,
      age:            session.age,
      major:          session.major,
      sleep_hours:    session.sleepHours,
      // ── Experiment metadata ──
      experiment:     session.experiment,
      trial_number:   dataset.length + 1,
      // ── Trial data (defaults + spread) ──
      condition:      trialData.condition  ?? '',
      stimulus:       trialData.stimulus   ?? '',
      response:       trialData.response   ?? '',
      correct:        trialData.correct    ?? 0,
      rt_ms:          trialData.rt_ms      ?? -1,
      timestamp:      new Date().toISOString(),
      ...trialData
    };
    dataset.push(row);
    return row;
  }

  function getDataset()   { return [...dataset] }
  function getSession()   { return { ...session } }
  function getTrialCount(){ return dataset.length }
  function filterBy(field, value){ return dataset.filter(r => r[field] === value) }

  // ── Math utilities ──
  function mean(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function accuracy(trials) {
    if (!trials || trials.length === 0) return null;
    return parseFloat(((trials.filter(t => t.correct === 1).length / trials.length) * 100).toFixed(1));
  }

  return {
    initSession, logTrial,
    getDataset, getSession, getTrialCount, filterBy,
    utils: { mean, accuracy }
  };

})();
