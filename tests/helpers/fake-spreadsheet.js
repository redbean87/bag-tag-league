'use strict';

/**
 * Minimal in-memory fake of a Google Sheets spreadsheet, sheet, and range.
 * Only the surface used by Code.gs / ProvisionDoubles.gs is implemented.
 */

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows === undefined ? 1 : numRows;
    this.numCols = numCols === undefined ? 1 : numCols;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const sheetRow = this.sheet.rows[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const value = sheetRow[this.col - 1 + c];
        line.push(value === undefined ? '' : value);
      }
      out.push(line);
    }
    return out;
  }

  setValues(matrix) {
    for (let r = 0; r < this.numRows; r++) {
      const rowIndex = this.row - 1 + r;
      if (!this.sheet.rows[rowIndex]) this.sheet.rows[rowIndex] = [];
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.rows[rowIndex][this.col - 1 + c] = matrix[r][c];
      }
    }
    return this;
  }

  setValue(value) {
    for (let r = 0; r < this.numRows; r++) {
      const rowIndex = this.row - 1 + r;
      if (!this.sheet.rows[rowIndex]) this.sheet.rows[rowIndex] = [];
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.rows[rowIndex][this.col - 1 + c] = value;
      }
    }
    return this;
  }

  getValue() {
    const row = this.sheet.rows[this.row - 1] || [];
    const value = row[this.col - 1];
    return value === undefined ? '' : value;
  }

  setFontWeight() {
    return this;
  }

  setNumberFormat() {
    return this;
  }
}

class FakeSheet {
  constructor(name, spreadsheet) {
    this.name = name;
    this.spreadsheet = spreadsheet;
    this.rows = [];
    this.frozenRows = 0;
  }

  getName() {
    return this.name;
  }

  setName(name) {
    this.name = name;
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    let max = 0;
    for (const row of this.rows) {
      if (row.length > max) max = row.length;
    }
    return max;
  }

  getDataRange() {
    return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn());
  }

  getRange(row, col, numRows, numCols) {
    return new FakeRange(this, row, col, numRows, numCols);
  }

  appendRow(row) {
    this.rows.push(row.slice());
    return this;
  }

  clear() {
    this.rows = [];
    return this;
  }

  setFrozenRows(count) {
    this.frozenRows = count;
    return this;
  }

  getIndex() {
    return this.spreadsheet.getSheets().indexOf(this) + 1;
  }
}

class FakeSpreadsheet {
  constructor(name) {
    this.name = name || 'Fake Spreadsheet';
    this.sheets = [];
    this.activeSheet = null;
  }

  getSheets() {
    return this.sheets.slice();
  }

  getSheetByName(name) {
    return this.sheets.find((sheet) => sheet.getName() === name) || null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name, this);
    this.sheets.push(sheet);
    return sheet;
  }

  deleteSheet(sheet) {
    const index = this.sheets.indexOf(sheet);
    if (index !== -1) this.sheets.splice(index, 1);
  }

  setActiveSheet(sheet) {
    this.activeSheet = sheet;
    return sheet;
  }

  getActiveSheet() {
    return this.activeSheet;
  }

  moveActiveSheet(position) {
    const sheet = this.activeSheet;
    const index = this.sheets.indexOf(sheet);
    if (index === -1) return;
    this.sheets.splice(index, 1);
    this.sheets.splice(position - 1, 0, sheet);
  }
}

module.exports = { FakeRange, FakeSheet, FakeSpreadsheet };
