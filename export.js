/**
 * export.js — CSV Export Module
 * ═══════════════════════════════════════════════════════════
 * Converts the CEP dataset into a clean, analysis-ready CSV
 * and triggers an automatic browser download.
 *
 * Output format:
 *   - UTF-8 encoded
 *   - Comma-separated values
 *   - Double-quoted fields (safe for Excel / R / Python pandas)
 *   - Header row matches dataset schema
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.export = (() => {

  // ── Google Sheets auto-submit endpoint ────────────────────
  const SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbypnaR0q3dOQ26RTBiO5-Cbjoa0pqkAFK-bVvcBSYckBePFQVlrYe8NnV_w8PZrXFRG/exec';

  /**
   * escapeCSV
   * Safely escape a value for CSV output.
   * Wraps in double quotes and escapes internal double quotes.
   * @param {any} val
   * @returns {string}
   */
  function escapeCSV(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    // Wrap in quotes; escape existing quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  /**
   * datasetToCSV
   * Converts an array of trial objects to a CSV string.
   * Column order is derived from the union of all keys in the dataset,
   * with core fields pinned to the front.
   * @param {Object[]} dataset
   * @returns {string}
   */
  function datasetToCSV(dataset) {
    if (!dataset || dataset.length === 0) {
      return 'No data recorded.';
    }

    // ── Define preferred column ordering (core fields first) ──
    const coreFields = [
      'participant_id',
      'gender',
      'age',
      'major',
      'sleep_hours',
      'experiment',
      'trial_number',
      'condition',
      'stimulus',
      'response',
      'correct',
      'rt_ms',
      'timestamp'
    ];

    // Collect all extra fields from the dataset (experiment-specific columns)
    const allKeys = new Set();
    dataset.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

    // Build final ordered column list: core first, then any extras
    const extraFields = [...allKeys].filter(k => !coreFields.includes(k));
    const columns = [...coreFields, ...extraFields];

    // ── Build CSV string ──
    const headerRow = columns.map(escapeCSV).join(',');
    const dataRows = dataset.map(row =>
      columns.map(col => escapeCSV(row[col])).join(',')
    );

    return [headerRow, ...dataRows].join('\r\n');
  }

  /**
   * metricsToCSV
   * Appends a summary statistics block after the trial data rows.
   * Format: two columns — "metric" and "value" — preceded by a blank
   * line and a [SUMMARY STATISTICS] header comment.
   * @param {Object[]} metrics  — array of { label, value, unit } objects
   * @returns {string}
   */
  function metricsToCSV(metrics) {
    if (!metrics || metrics.length === 0) return '';
    const lines = [
      '',                                         // blank separator line
      escapeCSV('[SUMMARY STATISTICS]') + ',,,',  // section header
      [escapeCSV('metric'), escapeCSV('value'), escapeCSV('unit')].join(',')
    ];
    metrics.forEach(m => {
      lines.push([
        escapeCSV(m.label ?? ''),
        escapeCSV(String(m.value ?? '')),
        escapeCSV(m.unit  ?? '')
      ].join(','));
    });
    return lines.join('\r\n');
  }

  /**
   * generateFilename
   * Constructs a timestamped filename for the export.
   * Format: CEP_<participantId>_<experiment>_<YYYYMMDD_HHMMSS>.csv
   */
  function generateFilename() {
    const session = CEP.data.getSession();
    const pid = session.participantId || 'unknown';
    const exp = session.experiment    || 'exp';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      '_',
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');
    return `CEP_${pid}_${exp}_${stamp}.csv`;
  }

  /**
   * downloadCSV
   * Main export function. Converts dataset → CSV → browser download.
   * No server required — uses Blob URL + <a> click trick.
   */
  function downloadCSV() {
    const dataset = CEP.data.getDataset();

    if (dataset.length === 0) {
      alert('No trial data recorded yet. Run an experiment first.');
      return;
    }

    const csvContent = datasetToCSV(dataset) + metricsToCSV(CEP.data.getMetrics());
    const filename   = generateFilename();

    // Create Blob and object URL
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);

    // Trigger download via invisible anchor
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 500);

    console.log(`[CEP] Exported ${dataset.length} trials → ${filename}`);
    return filename;
  }

  /**
   * previewCSV
   * Returns the raw CSV string (useful for debugging or display).
   */
  function previewCSV() {
    return datasetToCSV(CEP.data.getDataset()) + metricsToCSV(CEP.data.getMetrics());
  }

  // ─────────────────────────────────────────────────────────────
  // submitToSheets
  // Silently POSTs the full session (trials + metrics + participant
  // info) to the Google Apps Script endpoint. Non-blocking — the
  // results screen renders immediately; sync runs in background.
  //
  // Payload shape sent to Apps Script:
  //   { rows: [...trial objects], metrics: [...metric objects], session: {...} }
  // ─────────────────────────────────────────────────────────────
  async function submitToSheets() {
    const dataset = CEP.data.getDataset();
    const metrics = CEP.data.getMetrics() || [];
    const session = CEP.data.getSession();

    if (!dataset.length) return;

    showToast('Syncing to Google Sheets…', 'syncing');

    // Build a flat summary row from metrics (for the Summary sheet tab)
    const summaryRow = { participant_id: session.participantId, experiment: session.experiment,
      gender: session.gender, age: session.age, major: session.major,
      sleep_hours: session.sleepHours, session_time: new Date().toISOString(),
      total_trials: dataset.length };
    metrics.forEach(m => {
      // Convert label to a safe key e.g. "Mean RT — Congruent" → "mean_rt_congruent"
      const key = m.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      summaryRow[key] = String(m.value);
    });

    const payload = JSON.stringify({ rows: dataset, summary: summaryRow });

    try {
      // Apps Script requires Content-Type text/plain to avoid CORS preflight rejection
      const res  = await fetch(SHEETS_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body:    payload
      });
      const json = await res.json();
      if (json.status === 'ok') {
        showToast(`✓ Saved to Google Sheets (${json.written} rows)`, 'ok');
      } else {
        showToast('⚠ Sheets sync failed — export CSV manually', 'warn');
        console.error('[CEP] Sheets error:', json.message);
      }
    } catch (err) {
      showToast('⚠ Offline — use CSV export', 'warn');
      console.error('[CEP] Fetch error:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // showToast — small non-blocking corner notification
  // type: 'syncing' | 'ok' | 'warn'
  // ─────────────────────────────────────────────────────────────
  function showToast(msg, type) {
    const existing = document.getElementById('cep-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id          = 'cep-toast';
    toast.textContent = msg;
    toast.className   = `cep-toast cep-toast-${type}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('cep-toast-show'));

    // Auto-dismiss after 4s
    setTimeout(() => {
      toast.classList.remove('cep-toast-show');
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, 4000);
  }

  // Public API
  return {
    downloadCSV,
    submitToSheets,
    previewCSV,
    datasetToCSV  // exposed for testing
  };

})();
