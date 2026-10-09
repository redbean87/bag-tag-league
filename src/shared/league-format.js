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

  // Scoring is an independent axis from format: `format` says how a score is
  // made up (singles/doubles), `scoring` says what is settled (tags/points).
  // The capability flags below derive from these two enums, never from a
  // league id, so a future format x scoring league routes without code edits.
  var SCORING = {
    TAGS: 'tags',
    POINTS: 'points'
  };

  var SCORINGS = [SCORING.TAGS, SCORING.POINTS];

  // The app is served from two addresses: the live worker and a development
  // worker (`bag-tag-league-dev`). The serving address decides whether the
  // test-flagged POC leagues are offered in the admin picker. An environment is
  // never inferred from anything but the address; see environmentForHost.
  var ENVIRONMENTS = {
    PRODUCTION: 'production',
    DEVELOPMENT: 'development'
  };

  // The leagues this app manages. Each record is the single source of truth
  // for its id, display name, format, scoring, and spreadsheet. Every league
  // carries its own format and scoring as data; routing and gating read the
  // derived capability rules, never a hardcoded switch.
  // Spreadsheet ids are kept in sync with scripts/Code.gs
  // (SPREADSHEET_ID / SPREADSHEET_ID_DOUBLES / SPREADSHEET_ID_DOUBLES_TEST).
  var LEAGUES = [
    {
      id: 'b-rads-league',
      name: "B Rad's League",
      format: FORMATS.SINGLES,
      scoring: SCORING.TAGS,
      spreadsheetId: '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik'
    },
    {
      id: 'nightfliers-random-dubs',
      name: 'Nightfliers Random Dubs',
      format: FORMATS.DOUBLES,
      scoring: SCORING.POINTS,
      spreadsheetId: '1UPyr7AKEdFy7ypjrrtphpyjzs55YA2P57XOkESpsc1g'
    },
    {
      id: 'nightfliers-random-dubs-test',
      name: 'Nightfliers Random Dubs (Test)',
      format: FORMATS.DOUBLES,
      scoring: SCORING.POINTS,
      spreadsheetId: '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8',
      // Test surface: the guarded test-data reset may write here. The live
      // Singles and production Doubles leagues are never flagged, so the reset
      // can never target them. Test-flagged leagues are hidden from the admin
      // league picker.
      test: true
    }
  ];

  var DEFAULT_LEAGUE_ID = LEAGUES[0].id;

  function leagues() {
    return LEAGUES.slice();
  }

  // Resolves the running environment from the host that served the page. The
  // development worker is named with a `-dev` suffix (`bag-tag-league-dev`),
  // and a conventional `dev.` prefix is accepted too, without hardcoding the
  // account-specific workers.dev subdomain. Detection is fail-safe: anything
  // that is not clearly the development address, including a missing, empty,
  // or unparseable host, resolves to production so a test league can never
  // leak onto the live address.
  function environmentForHost(host) {
    if (typeof host !== 'string') return ENVIRONMENTS.PRODUCTION;
    var firstLabel = host.trim().toLowerCase().split('.')[0];
    if (!firstLabel) return ENVIRONMENTS.PRODUCTION;
    if (firstLabel === 'dev' || firstLabel.slice(-4) === '-dev') {
      return ENVIRONMENTS.DEVELOPMENT;
    }
    return ENVIRONMENTS.PRODUCTION;
  }

  // The environment of the page that loaded this registry. It reads the
  // serving hostname in the browser and falls back to production when the
  // hostname is unavailable, so the default is always the safe one.
  function currentEnvironment() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        return environmentForHost(window.location.hostname);
      }
    } catch (e) {
      // Fall through to the production default.
    }
    return ENVIRONMENTS.PRODUCTION;
  }

  // The leagues a coordinator can pick. Test-flagged leagues are development
  // surfaces (the former proof-of-concept workbook): the production address
  // keeps hiding them, while the development address lists them alongside the
  // production leagues so POC work can select a disposable sheet. The
  // environment argument is an ENVIRONMENTS value; anything else, and the
  // omitted/default case, resolves against the serving address and fails safe
  // to production.
  function selectableLeagues(environment) {
    var env = environment || currentEnvironment();
    return LEAGUES.filter(function(league) {
      if (league.test !== true) return true;
      return env === ENVIRONMENTS.DEVELOPMENT;
    });
  }

  function leagueById(id) {
    for (var i = 0; i < LEAGUES.length; i++) {
      if (LEAGUES[i].id === id) return LEAGUES[i];
    }
    return null;
  }

  // Normalizes an unknown format to the registry default (singles) instead of
  // coercing it into the other value. Callers that read a stored value can
  // therefore degrade loudly rather than silently mis-route.
  function normalizeFormat(format) {
    return format === FORMATS.DOUBLES ? FORMATS.DOUBLES : FORMATS.SINGLES;
  }

  // Normalizes an unknown scoring method to the registry default (tags).
  function normalizeScoring(scoring) {
    return scoring === SCORING.POINTS ? SCORING.POINTS : SCORING.TAGS;
  }

  // Kept as the format normalizer for existing callers.
  function normalize(format) {
    return normalizeFormat(format);
  }

  // The one capability resolver every gate reads. Derived only from the two
  // enums, never from a league id, so a future league works without touching
  // the handlers that branch on it.
  function rulesForLeague(id) {
    var league = leagueById(normalizeLeagueId(id));
    var format = normalizeFormat(league ? league.format : null);
    var scoring = normalizeScoring(league ? league.scoring : null);
    return {
      format: format,
      scoring: scoring,
      usesTags: scoring === SCORING.TAGS,
      usesPoints: scoring === SCORING.POINTS,
      hasPairs: format === FORMATS.DOUBLES
    };
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

  function scoringForLeague(id) {
    return rulesForLeague(id).scoring;
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
    SCORING: SCORING,
    SCORINGS: SCORINGS,
    LEAGUES: LEAGUES,
    DEFAULT_LEAGUE_ID: DEFAULT_LEAGUE_ID,
    ENVIRONMENTS: ENVIRONMENTS,
    environmentForHost: environmentForHost,
    currentEnvironment: currentEnvironment,
    leagues: leagues,
    selectableLeagues: selectableLeagues,
    leagueById: leagueById,
    normalizeLeagueId: normalizeLeagueId,
    leagueIdForFormat: leagueIdForFormat,
    readStoredLeagueId: readStoredLeagueId,
    persistLeagueId: persistLeagueId,
    formatForLeague: formatForLeague,
    scoringForLeague: scoringForLeague,
    rulesForLeague: rulesForLeague,
    spreadsheetIdForLeague: spreadsheetIdForLeague,
    normalize: normalize,
    normalizeFormat: normalizeFormat,
    normalizeScoring: normalizeScoring,
    readStoredFormat: readStoredFormat,
    persistFormat: persistFormat,
    spreadsheetIdForFormat: spreadsheetIdForFormat
  };
});
