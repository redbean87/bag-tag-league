/**
 * Shared league registry and selection for the browser frontends.
 *
 * The admin page persists the operator's selected league id in localStorage
 * and derives both the active spreadsheet id and the league format from that
 * league's record. Format is data carried by each league (never a separate
 * hardcoded Singles/Doubles switch), so a league cannot route according to a
 * stale or independently maintained format value.
 *
 * The first league is the default for every new or existing operator, so an
 * operator who never picks a league keeps the original singles behavior.
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
  var STORAGE_KEY = 'bagTagLeague.leagueId';

  // Pre-league storage stored the format string directly. Read it once so an
  // operator who already chose doubles keeps managing doubles after the
  // upgrade, then write the league id to the new key.
  var LEGACY_STORAGE_KEY = 'bagTagLeague.leagueFormat';

  var FORMATS = {
    SINGLES: 'singles',
    DOUBLES: 'doubles'
  };

  // The leagues this app manages. Each record is the single source of truth
  // for its id, display name, format, and spreadsheet. Every league carries
  // its own format as data; routing and gating read league.format.
  // Spreadsheet ids are kept in sync with scripts/Code.gs
  // (SPREADSHEET_ID / SPREADSHEET_ID_DOUBLES).
  var LEAGUES = [
    {
      id: 'b-rads-league',
      name: "B Rad's League",
      format: FORMATS.SINGLES,
      spreadsheetId: '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik'
    },
    {
      id: 'nightfliers-random-dubs',
      name: 'Nightfliers Random Dubs',
      format: FORMATS.DOUBLES,
      spreadsheetId: '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8'
    }
  ];

  var DEFAULT_LEAGUE_ID = LEAGUES[0].id;

  function leagues() {
    return LEAGUES.slice();
  }

  function leagueById(id) {
    for (var i = 0; i < LEAGUES.length; i++) {
      if (LEAGUES[i].id === id) return LEAGUES[i];
    }
    return null;
  }

  function normalize(format) {
    return format === FORMATS.DOUBLES ? FORMATS.DOUBLES : FORMATS.SINGLES;
  }

  function leagueIdForFormat(format) {
    var wanted = normalize(format);
    for (var i = 0; i < LEAGUES.length; i++) {
      if (LEAGUES[i].format === wanted) return LEAGUES[i].id;
    }
    return DEFAULT_LEAGUE_ID;
  }

  function normalizeLeagueId(id) {
    return leagueById(id) ? id : DEFAULT_LEAGUE_ID;
  }

  function readStoredLeagueId(storage) {
    try {
      if (!storage) return DEFAULT_LEAGUE_ID;
      var stored = storage.getItem(STORAGE_KEY);
      if (stored && leagueById(stored)) return stored;
      var legacyFormat = storage.getItem(LEGACY_STORAGE_KEY);
      return legacyFormat ? leagueIdForFormat(legacyFormat) : DEFAULT_LEAGUE_ID;
    } catch (e) {
      return DEFAULT_LEAGUE_ID;
    }
  }

  function persistLeagueId(storage, id) {
    var normalized = normalizeLeagueId(id);
    try {
      if (storage) storage.setItem(STORAGE_KEY, normalized);
    } catch (e) {
      // Ignore storage failures (private mode, quota, etc.).
    }
    return normalized;
  }

  function formatForLeague(id) {
    return leagueById(normalizeLeagueId(id)).format;
  }

  function spreadsheetIdForLeague(id) {
    return leagueById(normalizeLeagueId(id)).spreadsheetId;
  }

  // ─── Format helpers (backward compatible, derived through league data) ───
  // Kept so callers that only know a format keep working; they resolve to the
  // league that carries that format rather than maintaining a parallel map.

  function readStoredFormat(storage) {
    return formatForLeague(readStoredLeagueId(storage));
  }

  function persistFormat(storage, format) {
    persistLeagueId(storage, leagueIdForFormat(format));
    return normalize(format);
  }

  function spreadsheetIdForFormat(format) {
    return spreadsheetIdForLeague(leagueIdForFormat(format));
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    FORMATS: FORMATS,
    LEAGUES: LEAGUES,
    DEFAULT_LEAGUE_ID: DEFAULT_LEAGUE_ID,
    leagues: leagues,
    leagueById: leagueById,
    normalizeLeagueId: normalizeLeagueId,
    leagueIdForFormat: leagueIdForFormat,
    readStoredLeagueId: readStoredLeagueId,
    persistLeagueId: persistLeagueId,
    formatForLeague: formatForLeague,
    spreadsheetIdForLeague: spreadsheetIdForLeague,
    normalize: normalize,
    readStoredFormat: readStoredFormat,
    persistFormat: persistFormat,
    spreadsheetIdForFormat: spreadsheetIdForFormat
  };
});
