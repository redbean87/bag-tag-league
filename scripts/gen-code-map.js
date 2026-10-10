#!/usr/bin/env node
'use strict';

// Generates scripts/CODE_MAP.md, a navigation index of the top-level sections
// and functions in scripts/Code.gs with line ranges, so an agent can read only
// the slice it needs instead of the whole file. Run `node scripts/gen-code-map.js`
// after editing Code.gs; tests/code-map.test.js fails when the map is stale.

const fs = require('node:fs');
const path = require('node:path');

const CODE_PATH = path.join(__dirname, 'Code.gs');
const MAP_PATH = path.join(__dirname, 'CODE_MAP.md');
const SUMMARY_LIMIT = 96;

// Walks one top-level statement starting at startIdx and returns the index of
// its last line. A brace-only depth counter matches `}` for functions; the
// statement mode also tracks () and [] and stops at the `;` that closes the
// statement. Strings, template literals, and comments are skipped so their
// contents cannot unbalance the count.
function scanEnd(lines, startIdx, mode) {
  let depth = 0;
  let state = 'code';
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];
      if (state === 'line-comment') break;
      if (state === 'block-comment') {
        if (ch === '*' && next === '/') {
          state = 'code';
          c++;
        }
        continue;
      }
      if (state === 'sq' || state === 'dq' || state === 'tpl') {
        if (ch === '\\') {
          c++;
          continue;
        }
        if ((state === 'sq' && ch === "'") || (state === 'dq' && ch === '"') || (state === 'tpl' && ch === '`')) {
          state = 'code';
        }
        continue;
      }
      if (ch === '/' && next === '/') {
        state = 'line-comment';
        c++;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block-comment';
        c++;
        continue;
      }
      if (ch === "'") {
        state = 'sq';
        continue;
      }
      if (ch === '"') {
        state = 'dq';
        continue;
      }
      if (ch === '`') {
        state = 'tpl';
        continue;
      }
      if (mode === 'func') {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) return i;
        }
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ';' && depth === 0) return i;
    }
    if (state === 'line-comment') state = 'code';
  }
  return lines.length - 1;
}

// Collapses a lead comment into a one-line summary: the first sentence,
// truncated at SUMMARY_LIMIT characters.
function summarize(leadLines) {
  const text = leadLines
    .map((line) => line.replace(/^\s*(\/\*+|\*\/?|\/\/)\s?/, '').replace(/\s*\*\/\s*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const stop = text.indexOf('. ');
  let summary = stop === -1 ? text : text.slice(0, stop + 1);
  if (summary.length > SUMMARY_LIMIT) summary = summary.slice(0, SUMMARY_LIMIT - 3).trimEnd() + '...';
  return summary;
}

// Parses the file into top-level entries: function declarations, runs of
// constant declarations (a "section"), and anything else at column zero.
function buildEntries(lines) {
  const entries = [];
  let pendingLead = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      pendingLead = null;
      i++;
      continue;
    }
    const banner = line.match(/^\/\/\s*─+\s*(.+?)\s*─+\s*$/);
    if (banner) {
      entries.push({ kind: 'banner', name: banner[1], start: i, end: i });
      pendingLead = null;
      i++;
      continue;
    }
    if (/^\s*\/\*/.test(line)) {
      const start = i;
      while (i < lines.length && !/\*\//.test(lines[i])) i++;
      pendingLead = { start, end: i, lines: lines.slice(start, i + 1) };
      i++;
      continue;
    }
    if (/^\s*\/\//.test(line)) {
      const start = i;
      while (i < lines.length && /^\s*\/\//.test(lines[i])) i++;
      pendingLead = { start, end: i - 1, lines: lines.slice(start, i) };
      continue;
    }
    const func = line.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
    if (func) {
      const end = scanEnd(lines, i, 'func');
      const lead = pendingLead;
      entries.push({
        kind: 'func',
        name: func[1],
        params: func[2],
        start: lead && lead.end === i - 1 ? lead.start : i,
        end,
        summary: lead && lead.end === i - 1 ? summarize(lead.lines) : ''
      });
      pendingLead = null;
      i = end + 1;
      continue;
    }
    const decl = line.match(/^(?:const|var|let)\s+([A-Za-z_$][\w$]*)/);
    if (decl) {
      const end = scanEnd(lines, i, 'stmt');
      const lead = pendingLead;
      entries.push({
        kind: 'decl',
        name: decl[1],
        start: lead && lead.end === i - 1 ? lead.start : i,
        end
      });
      pendingLead = null;
      i = end + 1;
      continue;
    }
    entries.push({ kind: 'other', start: i, end: i, text: line.trim() });
    pendingLead = null;
    i++;
  }
  // Merge adjacent constant declarations into one section entry.
  const merged = [];
  for (const entry of entries) {
    const prev = merged[merged.length - 1];
    if (entry.kind === 'decl' && prev && prev.kind === 'section' && entry.start <= prev.end + 2) {
      prev.end = entry.end;
      prev.names.push(entry.name);
      continue;
    }
    if (entry.kind === 'decl') {
      merged.push({ kind: 'section', start: entry.start, end: entry.end, names: [entry.name] });
      continue;
    }
    merged.push(entry);
  }
  return merged;
}

function describe(entry) {
  if (entry.kind === 'func') {
    const summary = entry.summary ? ' - ' + entry.summary : '';
    return 'function ' + entry.name + '(' + entry.params + ')' + summary;
  }
  if (entry.kind === 'section') {
    const names = entry.names;
    const display = names.length <= 3 ? names.join(', ') : names[0] + ' ... ' + names[names.length - 1] + ' (' + names.length + ' declarations)';
    return 'constants: ' + display;
  }
  return 'other top-level statement: ' + entry.text;
}

function buildSections(entries, totalLines) {
  const banners = entries.filter((entry) => entry.kind === 'banner');
  const opens = banners.filter((entry) => !/^end\b/i.test(entry.name));
  const sections = opens.map((banner) => {
    const close = banners.find(
      (other) => other.start > banner.start && other.name.toLowerCase() === 'end ' + banner.name.toLowerCase()
    );
    const next = banners.find((other) => other.start > banner.start);
    const end = close ? close.start : (next ? next.start : totalLines) - 1;
    return { name: banner.name, start: banner.start, end };
  });
  for (const section of sections) {
    section.depth = sections.filter(
      (other) =>
        other !== section && other.start <= section.start && other.end >= section.end && other.end - other.start > section.end - section.start
    ).length;
  }
  return sections;
}

function buildMap() {
  const source = fs.readFileSync(CODE_PATH, 'utf8');
  const lines = source.split('\n');
  const entries = buildEntries(lines);
  const lastContentLine = lines.length - 1 - [...lines].reverse().findIndex((line) => line.trim() !== '');
  const sections = buildSections(entries, lastContentLine);
  const contentEntries = entries.filter((entry) => entry.kind !== 'banner');
  const width = String(lines.length).length;
  const range = (entry) => String(entry.start + 1).padStart(width) + '-' + String(entry.end + 1).padEnd(width);
  const rows = contentEntries.map((entry) => range(entry) + '  ' + describe(entry));
  const sectionRows = sections.map((section) => range(section) + '  ' + '  '.repeat(section.depth) + section.name);
  return [
    '# scripts/Code.gs navigation map',
    '',
    'An index of the top-level sections and functions in `scripts/Code.gs` with line ranges, so a reader can read only the slice they need instead of the whole file.',
    '',
    'Line numbers refer to the committed `scripts/Code.gs` as of this revision.',
    '',
    'The section ranges come from the `// --- Name ---` banner comments in `Code.gs` itself.',
    'Each section range runs from its opening banner to its closing `End` banner, or to the next banner or end of file.',
    '',
    'Regenerate with `node scripts/gen-code-map.js` after any edit to `scripts/Code.gs`.',
    '`tests/code-map.test.js` fails when this map is stale.',
    '',
    '## Sections',
    '',
    '```',
    ...sectionRows,
    '```',
    '',
    '## Contents',
    '',
    '```',
    ...rows,
    '```',
    ''
  ].join('\n');
}

if (require.main === module) {
  const map = buildMap();
  if (process.argv.includes('--check')) {
    const committed = fs.existsSync(MAP_PATH) ? fs.readFileSync(MAP_PATH, 'utf8') : '';
    if (committed !== map) {
      console.error('scripts/CODE_MAP.md is stale - regenerate with: node scripts/gen-code-map.js');
      process.exit(1);
    }
    console.log('scripts/CODE_MAP.md is up to date');
  } else {
    fs.writeFileSync(MAP_PATH, map);
    console.log('wrote ' + MAP_PATH);
  }
}

module.exports = { CODE_PATH, MAP_PATH, buildMap };
