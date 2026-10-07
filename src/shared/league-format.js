/**
 * Shared league-format selection for the browser frontends.
 *
 * The admin page persists the operator's Singles/Doubles choice in
 * localStorage and derives the active spreadsheet ID from it. Singles is the
 * default for every new or existing operator, so an operator who never picks a
 * format keeps the original singles behavior.
 *
 * Loaded as a plain script in the browser (window.LeagueFormat) and as a
 * CommonJS module in tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LeagueFormat = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var STORAGE_KEY = 'bagTagLeague.leagueFormat';

  var FORMATS = {
    SINGLES: 'singles',
    DOUBLES: 'doubles'
  };

  // Keep in sync with scripts/Code.gs (SPREADSHEET_ID / SPREADSHEET_ID_DOUBLES).
  var SPREADSHEET_IDS = {
    singles: '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik',
    doubles: '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8'
  };

  function normalize(format) {
    return format === FORMATS.DOUBLES ? FORMATS.DOUBLES : FORMATS.SINGLES;
  }

  function readStoredFormat(storage) {
    try {
      if (!storage) return FORMATS.SINGLES;
      var stored = storage.getItem(STORAGE_KEY);
      return stored ? normalize(stored) : FORMATS.SINGLES;
    } catch (e) {
      return FORMATS.SINGLES;
    }
  }

  function persistFormat(storage, format) {
    var normalized = normalize(format);
    try {
      if (storage) storage.setItem(STORAGE_KEY, normalized);
    } catch (e) {
      // Ignore storage failures (private mode, quota, etc.).
    }
    return normalized;
  }

  function spreadsheetIdForFormat(format) {
    return SPREADSHEET_IDS[normalize(format)];
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    FORMATS: FORMATS,
    SPREADSHEET_IDS: SPREADSHEET_IDS,
    normalize: normalize,
    readStoredFormat: readStoredFormat,
    persistFormat: persistFormat,
    spreadsheetIdForFormat: spreadsheetIdForFormat
  };
});
