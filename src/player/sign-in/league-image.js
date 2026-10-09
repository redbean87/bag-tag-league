/**
 * Per-league image lookup for the player sign-in page.
 *
 * A league's image is a file checked into this repository under
 * `src/player/sign-in/league-images/`, named after the league id from the
 * registry (`src/shared/league-format.js`), for example
 * `nightfliers-random-dubs.png`. Nothing is stored in the League sheet and no
 * external URL or upload is involved: the image ships with the app.
 *
 * A league may supply one of several extensions, so the page tries each in a
 * fixed order and shows the first candidate that loads. When none loads the
 * image is hidden and the existing league-name text remains the fallback.
 *
 * Loaded as a plain script in the browser (window.LeagueImage) and as a
 * CommonJS module in tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LeagueImage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // The folder beside this page that holds one image per league. Relative so
  // it resolves against the served sign-in URL (`/player/sign-in/`).
  var IMAGE_DIRECTORY = 'league-images';

  // Tried in this order; the first candidate that loads is the one shown.
  var IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

  // Builds the URL for one league id and one extension.
  function imageUrl(leagueId, extension) {
    return IMAGE_DIRECTORY + '/' + leagueId + '.' + extension;
  }

  // Every candidate URL for a league id, in fallback order.
  function candidateImageUrls(leagueId) {
    var urls = [];
    for (var i = 0; i < IMAGE_EXTENSIONS.length; i++) {
      urls.push(imageUrl(leagueId, IMAGE_EXTENSIONS[i]));
    }
    return urls;
  }

  // Walks the candidates in order, calling `load(url, onResult)` for each and
  // advancing only when `onResult(false)` reports a miss. Calls `onResolved`
  // with the first URL that loads, or null when every candidate fails.
  function resolveLeagueImage(leagueId, load, onResolved) {
    var candidates = candidateImageUrls(leagueId);
    var index = 0;

    function tryNext() {
      if (index >= candidates.length) {
        onResolved(null);
        return;
      }
      var url = candidates[index++];
      load(url, function (loaded) {
        if (loaded) {
          onResolved(url);
        } else {
          tryNext();
        }
      });
    }

    tryNext();
  }

  // Browser probe: resolves a candidate as loaded or missing without touching
  // the page. Uses a fresh Image so a miss never affects the visible slot.
  function loadImageCandidate(url, onResult) {
    var probe = new Image();
    probe.onload = function () { onResult(true); };
    probe.onerror = function () { onResult(false); };
    probe.src = url;
  }

  // Wires the first loaded candidate into the image slot. On success the src
  // and alt are set and the slot is shown; on failure the slot stays hidden
  // (its default) and the league-name text remains the visible fallback.
  // `options.load` is injectable so tests can exercise the sequence without a
  // browser; it defaults to the real Image probe.
  function mountLeagueImage(options) {
    var opts = options || {};
    var img = opts.img;
    var league = opts.league || {};
    var load = opts.load || loadImageCandidate;

    if (!img || !league.id) return;

    if (league.name !== undefined) img.setAttribute('alt', league.name);

    resolveLeagueImage(league.id, load, function (url) {
      if (url) {
        img.setAttribute('src', url);
        if (img.classList) img.classList.remove('hidden');
      } else {
        img.removeAttribute('src');
        if (img.classList) img.classList.add('hidden');
      }
    });
  }

  return {
    IMAGE_DIRECTORY: IMAGE_DIRECTORY,
    IMAGE_EXTENSIONS: IMAGE_EXTENSIONS,
    imageUrl: imageUrl,
    candidateImageUrls: candidateImageUrls,
    resolveLeagueImage: resolveLeagueImage,
    loadImageCandidate: loadImageCandidate,
    mountLeagueImage: mountLeagueImage
  };
});
