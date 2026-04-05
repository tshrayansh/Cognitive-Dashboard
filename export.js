/**
 * export.js — Enhanced CSV Export Module (v2.1)
 * ═══════════════════════════════════════════════════════════
 * Converts the CEP dataset into a comprehensive multi-section CSV:
 *   1. Session Summary: participant info + all computed metrics
 *   2. Chart Data: underlying data for visualizations
 *   3. Raw Trial Data: individual trial records
 *
 * Output format:
 *   - UTF-8 encoded
 *   - Comma-separated values
 *   - Double-quoted fields (safe for Excel / R / Python pandas)
 *   - Three distinct sections separated by blank rows
 * ═══════════════════════════════════════════════════════════
 */

window.CEP = window.CEP || {};

CEP.export = (() => {

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

    const coreFields = [
      'participant_id',
      'experiment',
      'trial_number',
      'condition',
      'stimulus',
      'response',
      'correct',
      'rt_ms',
      'timestamp'
    ];

    const allKeys = new Set();
    dataset.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

    const extraFields = [...allKeys].filter(k => !coreFields.includes(k));
    const columns = [...coreFields, ...extraFields];

    const headerRow = columns.map(escapeCSV).join(',');
    const dataRows = dataset.map(row =>
      columns.map(col => escapeCSV(row[col])).join(',')
    );

    return [headerRow, ...dataRows].join('\r\n');
  }

  /**
   * generateSessionSummary
   * Creates a summary CSV section with session metadata and metrics.
   * @returns {string}
   */
  function generateSessionSummary() {
    const session = CEP.data.getSession();
    const dataset = CEP.data.getDataset();
    const EXP_MODULES = {
      stroop: CEP.stroop,
      memory: CEP.memory,
      falsememory: CEP.falseMemory
    };

    let summaryRows = [
      ['Session Summary'],
      [],
      ['Participant ID', session.participantId],
      ['Experiment', session.experiment],
      ['Gender', session.gender || 'N/A'],
      ['Age', session.age || 'N/A'],
      ['Major', session.major || 'N/A'],
      ['Sleep Hours', session.sleepHours || 'N/A'],
      ['Total Trials', dataset.length],
      ['Session Start', session.startTime || 'N/A'],
      [],
      ['Session Metrics']
    ];

    // Get metrics from experiment module
    const mod = EXP_MODULES[session.experiment];
    if (mod && mod.computeMetrics) {
      try {
        const metrics = mod.computeMetrics();
        metrics.forEach(m => {
          summaryRows.push([m.label, m.value, m.unit || '']);
        });
      } catch (e) {
        console.error('[CEP Export] Error computing metrics:', e);
      }
    }

    return summaryRows.map(row => 
      row.map(escapeCSV).join(',')
    ).join('\r\n');
  }

  /**
   * generateChartDataSection
   * Creates a CSV section with chart data for visualization.
   * @returns {string}
   */
  function generateChartDataSection() {
    const session = CEP.data.getSession();
    const EXP_MODULES = {
      stroop: CEP.stroop,
      memory: CEP.memory,
      falsememory: CEP.falseMemory
    };

    let chartRows = [
      ['Chart Data - ' + session.experiment],
      []
    ];

    const mod = EXP_MODULES[session.experiment];
    if (!mod || !mod.getChartData) {
      return chartRows.map(row => row.map(escapeCSV).join(',')).join('\r\n');
    }

    try {
      const chartData = mod.getChartData();
      chartRows.push(['Chart Title', chartData.title || 'N/A']);
      chartRows.push(['Chart Type', chartData.type || 'N/A']);
      chartRows.push([]);

      // Handle different chart types
      if (chartData.type === 'grouped-bar' && chartData.seriesA && chartData.seriesB) {
        // Grouped bar chart (Working Memory)
        chartRows.push(['Category', chartData.seriesA.name, chartData.seriesB.name]);
        for (let i = 0; i < chartData.xLabels.length; i++) {
          chartRows.push([
            chartData.xLabels[i],
            chartData.seriesA.values[i] || 0,
            chartData.seriesB.values[i] || 0
          ]);
        }
      } else {
        // Single bar chart (Stroop, False Memory)
        chartRows.push(['Category', chartData.yLabel || 'Value']);
        for (let i = 0; i < chartData.xLabels.length; i++) {
          chartRows.push([
            chartData.xLabels[i],
            chartData.yValues[i] || 0
          ]);
        }
      }
    } catch (e) {
      console.error('[CEP Export] Error generating chart data:', e);
      chartRows.push(['Error generating chart data']);
    }

    return chartRows.map(row => 
      row.map(escapeCSV).join(',')
    ).join('\r\n');
  }

  /**
   * generateFilename
   * Constructs a timestamped filename for the export.
   * Format: CEP_<participantId>_<experiment>_<YYYYMMDD_HHMMSS>.csv
   */
  function generateFilename() {
    const session = CEP.data.getSession();
    const pid = session.participantId || 'unknown';
    const exp = session.experiment || 'exp';
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
   * downloadEnhancedCSV
   * Main enhanced export function. Combines session summary, chart data,
   * and raw trial data into a single comprehensive CSV.
   */
  function downloadEnhancedCSV() {
    const dataset = CEP.data.getDataset();

    if (dataset.length === 0) {
      alert('No trial data recorded yet. Run an experiment first.');
      return;
    }

    // Generate all three sections
    const summarySection = generateSessionSummary();
    const chartSection = generateChartDataSection();
    const trialSection = datasetToCSV(dataset);

    // Combine with blank row separators
    const csvContent = [
      summarySection,
      '',
      '',
      chartSection,
      '',
      '',
      'Raw Trial Data',
      '',
      trialSection
    ].join('\r\n');

    const filename = generateFilename();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 500);

    console.log(`[CEP] Enhanced export: ${dataset.length} trials → ${filename}`);
    return filename;
  }

  /**
   * downloadCSV (legacy)
   * Legacy export function for backward compatibility.
   * Now calls the enhanced export function.
   */
  function downloadCSV() {
    return downloadEnhancedCSV();
  }

  /**
   * previewCSV
   * Returns the raw CSV string (useful for debugging or display).
   */
  function previewCSV() {
    return datasetToCSV(CEP.data.getDataset());
  }

  // Public API
  return {
    downloadCSV,
    downloadEnhancedCSV,
    previewCSV,
    datasetToCSV
  };

})();