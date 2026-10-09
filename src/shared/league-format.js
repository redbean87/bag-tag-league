/**
 * Shared league registry and selection for the browser frontends.
 *
 * The admin page persists the operator's selected league id in localStorage
 * and derives both the active spreadsheet id and the league format from that
 * league's record. Format is data carried by each league (never a separate
 * hardcoded Singles/Doubles switch), so a league cannot route according to a
 * stale or independently maintained format value.
 *
 * The default league is the first league visible in the environment of the
 * serving address, so an operator who never picks a league (or whose stored
 * league belongs to the other address) gets that address's first league and
 * never a hidden one.
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
  // worker (`bag-tag-league-dev`). Every league belongs to exactly one
  // environment, and the serving address decides which are offered in the
  // admin picker: the production address lists only production leagues, the
  // development address only development (POC) leagues. No league is visible
  // on both. An environment is never inferred from anything but the address;
  // see environmentForHost.
  var ENVIRONMENTS = {
    PRODUCTION: 'production',
    DEVELOPMENT: 'development'
  };

  // The leagues this app manages. Each record is the single source of truth
  // for its id, display name, format, scoring, spreadsheet, and environment.
  // Every league carries its own format and scoring as data; routing and
  // gating read the derived capability rules, never a hardcoded switch.
  // Spreadsheet ids are kept in sync with scripts/Code.gs
  // (SPREADSHEET_ID / SPREADSHEET_ID_DOUBLES / SPREADSHEET_ID_DOUBLES_TEST).
  //
  // `nightfliers-random-dubs` is the only production league: the doubles
  // league that actually runs. The other two are development POC surfaces
  // (the singles POC workbook and the doubles POC workbook), offered only on
  // the development address. The guarded test-data reset may target the
  // development surfaces but never the production spreadsheet.
  var LEAGUES = [
    {
      id: 'nightfliers-random-dubs',
      name: 'Nightfliers Random Doubles 💥',
      format: FORMATS.DOUBLES,
      scoring: SCORING.POINTS,
      spreadsheetId: '1UPyr7AKEdFy7ypjrrtphpyjzs55YA2P57XOkESpsc1g',
      environment: ENVIRONMENTS.PRODUCTION
    },
    {
      id: 'b-rads-league',
      name: "B Rad's League",
      format: FORMATS.SINGLES,
      scoring: SCORING.TAGS,
      spreadsheetId: '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik',
      environment: ENVIRONMENTS.DEVELOPMENT
    },
    {
      id: 'nightfliers-random-dubs-test',
      name: 'Nightfliers Random Dubs (Test)',
      format: FORMATS.DOUBLES,
      scoring: SCORING.POINTS,
      spreadsheetId: '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8',
      environment: ENVIRONMENTS.DEVELOPMENT
    }
  ];

  function leagues() {
    return LEAGUES.slice();
  }

  // Normalizes an unknown environment to the production default so a
  // malformed value can never expose a development league.
  function normalizeEnvironment(environment) {
    return environment === ENVIRONMENTS.DEVELOPMENT
      ? ENVIRONMENTS.DEVELOPMENT
      : ENVIRONMENTS.PRODUCTION;
  }

  // Resolves an environment argument. An explicit value is normalized; an
  // omitted one falls back to the serving address. Both fail safe to
  // production.
  function resolveEnvironment(environment) {
    return environment ? normalizeEnvironment(environment) : currentEnvironment();
  }

  // The default league is the first league visible in an environment, so a
  // hidden league can never be selected by default.
  function defaultLeagueId(environment) {
    var visible = selectableLeagues(environment);
    return visible.length ? visible[0].id : LEAGUES[0].id;
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

  // The leagues a coordinator can pick in an environment. Exactly the leagues
  // classified for that environment: the production address lists only
  // production leagues, the development address only development (POC)
  // leagues, and no league appears on both. An unknown or omitted environment
  // resolves against the serving address and fails safe to production.
  function selectableLeagues(environment) {
    var env = resolveEnvironment(environment);
    return LEAGUES.filter(function(league) {
      return league.environment === env;
    });
  }

  function leagueById(id) {
    for (var i = 0; i < LEAGUES.length; i++) {
      if (LEAGUES[i].id === id) return LEAGUES[i];
    }
    return null;
  }

  // Looks up a league by id, but only when it is visible in an environment.
  // Returns null for a hidden or unknown league so a caller cannot operate a
  // league that does not belong to the address it is running on.
  function selectableLeagueById(id, environment) {
    var league = leagueById(id);
    if (!league) return null;
    return league.environment === resolveEnvironment(environment) ? league : null;
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

  function leagueIdForFormat(format, environment) {
    var wanted = normalize(format);
    var visible = selectableLeagues(environment);
    for (var i = 0; i < visible.length; i++) {
      if (visible[i].format === wanted) return visible[i].id;
    }
    return defaultLeagueId(environment);
  }

  function normalizeLeagueId(id) {
    return leagueById(id) ? id : defaultLeagueId();
  }

  function readStoredLeagueId(storage) {
    var environment = currentEnvironment();
    try {
      if (!storage) return defaultLeagueId(environment);
      var stored = storage.getItem(STORAGE_KEY);
      if (stored && selectableLeagueById(stored, environment)) return stored;
      var legacyFormat = storage.getItem(LEGACY_STORAGE_KEY);
      if (legacyFormat) return leagueIdForFormat(legacyFormat, environment);
      return defaultLeagueId(environment);
    } catch (e) {
      return defaultLeagueId(environment);
    }
  }

  function persistLeagueId(storage, id) {
    var environment = currentEnvironment();
    var normalized = selectableLeagueById(id, environment) ? id : defaultLeagueId(environment);
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

  function spreadsheetIdForFormat(format, environment) {
    return spreadsheetIdForLeague(leagueIdForFormat(format, environment));
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    FORMATS: FORMATS,
    SCORING: SCORING,
    SCORINGS: SCORINGS,
    LEAGUES: LEAGUES,
    ENVIRONMENTS: ENVIRONMENTS,
    environmentForHost: environmentForHost,
    currentEnvironment: currentEnvironment,
    leagues: leagues,
    selectableLeagues: selectableLeagues,
    selectableLeagueById: selectableLeagueById,
    defaultLeagueId: defaultLeagueId,
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
