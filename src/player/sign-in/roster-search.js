/**
 * Client-side roster search for the player sign-in page.
 *
 * The page preloads the league roster once at page open with the existing
 * `listClubMembers` action (see scripts/Code.gs `handleListClubMembers`) so
 * that typing a player search is answered in the browser instead of waiting
 * on a full Apps Script round trip per pause. The preloaded copy lives in
 * page memory only — no localStorage, no shared cache — and the server
 * revalidates identity, money options, tag rules, and duplicates at
 * submission, so a stale entry can only surface as a rejected check-in,
 * never a wrong one.
 *
 * Matching semantics mirror the server's `handleSearchClubMembers`: trim,
 * require at least MIN_QUERY_LENGTH characters, case-insensitive substring
 * match over name, udisc_username, and pdga_number, active members only, in
 * roster order, capped at RESULT_LIMIT results. The result shape is the same
 * one the server's search returns, so the existing rendering and selection
 * flow works unchanged on either source.
 *
 * Loaded as a plain script in the browser (window.RosterSearch) and as a
 * CommonJS module in tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RosterSearch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var MIN_QUERY_LENGTH = 2;
  var RESULT_LIMIT = 10;

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  // Active exactly as the server counts it: a literal true or the sheet's
  // 'TRUE' string. Anything else (including a stale preload of a member who
  // was deactivated after page open) is not selectable.
  function isActive(member) {
    return member.is_active === true || member.is_active === 'TRUE';
  }

  /**
   * Validates a `listClubMembers` response and returns its selectable
   * (active) members, or null when the payload is a preload failure.
   *
   * A malformed or incomplete payload is never treated as a valid empty
   * roster: the caller keeps the existing server search fallback instead.
   * An `ok` payload whose members array is genuinely empty is a real empty
   * roster and returns [].
   */
  function selectableMembers(data) {
    if (!data || data.status !== 'ok' || !isArray(data.members)) return null;

    var members = [];
    for (var i = 0; i < data.members.length; i++) {
      var member = data.members[i];
      if (!member || typeof member !== 'object') return null;
      // member_number is the identity the check-in submits; name is the only
      // other field the search/selection flow cannot do without.
      if (member.member_number === undefined ||
          member.member_number === null ||
          member.member_number === '') return null;
      if (typeof member.name !== 'string') return null;
      if (!isActive(member)) continue;
      members.push(member);
    }
    return members;
  }

  // Case-insensitive substring match over the same three identity fields the
  // server scans.
  function matchesQuery(member, lowerQuery) {
    var name = (member.name || '').toString();
    var udisc = (member.udisc_username || '').toString();
    var pdga = (member.pdga_number || '').toString();

    return name.toLowerCase().indexOf(lowerQuery) !== -1 ||
      udisc.toLowerCase().indexOf(lowerQuery) !== -1 ||
      pdga.toLowerCase().indexOf(lowerQuery) !== -1;
  }

  /**
   * Filters a preloaded roster the way `handleSearchClubMembers` would:
   * returns up to RESULT_LIMIT active matches in roster order, shaped like
   * the server's search results. A query shorter than MIN_QUERY_LENGTH
   * matches nothing (the page clears results before calling).
   */
  function filterMembers(members, query) {
    var trimmed = (query || '').trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return [];

    var lowerQuery = trimmed.toLowerCase();
    var results = [];

    for (var i = 0; i < members.length && results.length < RESULT_LIMIT; i++) {
      var member = members[i];
      if (!isActive(member)) continue;
      if (!matchesQuery(member, lowerQuery)) continue;
      results.push({
        member_number: member.member_number,
        name: (member.name || '').toString(),
        udisc_username: (member.udisc_username || '').toString(),
        pdga_number: (member.pdga_number || '').toString(),
        current_tag: member.current_tag,
        season_points: member.season_points
      });
    }

    return results;
  }

  return {
    MIN_QUERY_LENGTH: MIN_QUERY_LENGTH,
    RESULT_LIMIT: RESULT_LIMIT,
    isActive: isActive,
    selectableMembers: selectableMembers,
    matchesQuery: matchesQuery,
    filterMembers: filterMembers
  };
});
