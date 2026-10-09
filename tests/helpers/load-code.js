'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeSpreadsheet } = require('./fake-spreadsheet');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Top-level `const` bindings in Code.gs are not properties of the VM global,
// so they are read back explicitly after loading.
const DEFAULT_CONSTANTS = [
  'SPREADSHEET_ID',
  'SPREADSHEET_ID_DOUBLES',
  'SPREADSHEET_ID_DOUBLES_TEST',
  'LEAGUE_ID_SINGLES',
  'LEAGUE_ID_DOUBLES',
  'LEAGUE_ID_DOUBLES_TEST',
  'DEFAULT_LEAGUE_ID',
  'LEAGUE_SPREADSHEETS',
  'TEST_SPREADSHEET_IDS',
  'LEAGUE_FORMAT_SINGLES',
  'LEAGUE_FORMAT_DOUBLES',
  'LEAGUE_FORMATS',
  'SCORING_TAGS',
  'SCORING_POINTS',
  'SCORING_METHODS',
  'WEEK_TEMPLATE_SHEET_NAME',
  'CLUB_MEMBER_HEADERS',
  'CLUB_MEMBER_HEADERS_DETAG',
  'CLUB_MEMBER_HEADERS_DOUBLES',
  'WEEKLY_RECORD_HEADERS',
  'WEEKLY_RECORD_HEADERS_DOUBLES',
  'WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED',
  'WEEKLY_RECORD_HEADERS_LEGACY',
  'WEEKLY_RECORD_HEADERS_LEGACY_DETAG',
  'WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES',
  'WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES_TAGGED',
  'WEEKLY_RECORD_DETAG_HEADERS',
  'LEAGUE_SHEET_HEADERS',
  'LEAGUE_SHEET_HEADERS_DOUBLES',
  'LEAGUE_SHEET_METADATA_HEADERS',
  'LEAGUE_SHEET_HEADERS_EXTENDED',
  'LEAGUE_POINTS_HEADERS',
  'LEAGUE_PAYOUT_HEADERS',
  'WEEKLY_RECORD_PAIR_HEADERS',
  'WEEKLY_RECORD_TEAM_HEADERS'
];

/**
 * Loads Apps Script source files into an isolated VM context with Google
 * service fakes. No credentials or network access are involved.
 */
function loadCode(codeFiles) {
  const files = codeFiles || ['scripts/Code.gs'];
  const openByIdCalls = [];
  const loggerLines = [];
  const scriptProperties = {};
  const spreadsheets = new Map();
  let lockWaitLock = function () { return true; };

  function makeSpreadsheet(id) {
    if (!spreadsheets.has(id)) {
      spreadsheets.set(id, new FakeSpreadsheet(id));
    }
    return spreadsheets.get(id);
  }

  const SpreadsheetApp = {
    openById(id) {
      openByIdCalls.push(id);
      return makeSpreadsheet(id);
    }
  };

  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      return {
        _text: text,
        _mimeType: null,
        setMimeType(mimeType) {
          this._mimeType = mimeType;
          return this;
        },
        getContent() {
          return this._text;
        }
      };
    }
  };

  const LockService = {
    getScriptLock() {
      return {
        waitLock() {
          return lockWaitLock();
        },
        releaseLock() {}
      };
    }
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(name) {
          return Object.prototype.hasOwnProperty.call(scriptProperties, name)
            ? scriptProperties[name]
            : null;
        },
        setProperty(name, value) {
          scriptProperties[name] = String(value);
        }
      };
    }
  };

  const Logger = {
    log(message) {
      loggerLines.push(String(message));
    }
  };

  const sandbox = {
    SpreadsheetApp,
    ContentService,
    LockService,
    PropertiesService,
    Logger,
    console,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    isNaN,
    parseInt,
    parseFloat
  };

  const context = vm.createContext(sandbox);

  for (const file of files) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  const bound = vm.runInContext('({' + DEFAULT_CONSTANTS.join(', ') + '})', context);

  return {
    bound,
    sandbox,
    openByIdCalls,
    loggerLines,
    makeSpreadsheet,
    setScriptProperty(name, value) {
      scriptProperties[name] = String(value);
    },
    setLockWaitLock(fn) {
      lockWaitLock = fn;
    },
    fn(name) {
      return sandbox[name];
    },
    parse(result) {
      return JSON.parse(result.getContent());
    }
  };
}

module.exports = { loadCode, REPO_ROOT };
