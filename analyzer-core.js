/*
 * PROTO CONTROL Analyzer core: turns BOM rows into Planner input (schema manufacturing-lt/input@1).
 * No DOM access.
 *
 * Browser: <script src="analyzer-core.js"></script> → window.AnalyzerCore
 * Node:    const AnalyzerCore = require("./analyzer-core.js")
 *
 * rows: array of arrays (one array per sheet row, cell values as read from the file).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AnalyzerCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const RULES_SCHEMA = "proto-control/analyzer-rules@1";

  // Editable in the Analyzer (Rules). Matching is case-insensitive "contains".
  const DEFAULT_RULES = {
    schema: RULES_SCHEMA,
    wire: {
      // A row is a wire (1 CCT) when its TYPE or NAME contains one of these words,
      // or its PART NO starts with one of the prefixes.
      keywords: ["電線", "ワイヤ", "ワイヤー", "wire", "kabel", "cable", "AVSS", "CAVS", "AVS", "AESSX", "CIVUS", "FLRY"],
      partPrefixes: [],
      // Words that make a row NOT a wire even if a keyword matched (e.g. "wire harness", "wire clamp").
      exclude: ["harness", "ハーネス", "clamp", "クランプ", "tie", "タイ", "terminal", "端子"],
      countMode: "rows" // "rows" = each wire row is 1 CCT, "qty" = sum of the wire rows' quantity
    },
    specials: {
      Marker: ["マーカー", "marker", "マークチューブ", "mark tube", "印字"],
      Ethernet: ["ethernet", "イーサ", "cat5", "cat6", "100base", "1000base"],
      Braiding: ["編組", "braid", "ブレード"],
      Solder: ["半田", "はんだ", "ハンダ", "solder"]
    },
    branch: {
      // Optional: count rows whose type/name contains one of these words as the branch count.
      enabled: false,
      keywords: []
    }
  };

  // Header words used to find the header row and guess the columns (JP / EN / ID).
  const HEADER_WORDS = {
    partNo: ["部品番号", "品番", "部品no", "part no", "partno", "part number", "p/n", "no part", "kode", "material no", "item no"],
    name: ["品名", "部品名", "名称", "description", "desc", "part name", "nama", "deskripsi", "name"],
    type: ["区分", "種類", "種別", "分類", "type", "category", "kategori", "jenis", "class"],
    qty: ["数量", "員数", "qty", "quantity", "jumlah", "q'ty", "pcs"],
    leadTime: ["リードタイム", "納期日数", "lt(日)", "lead time", "leadtime", "lt days", "l/t", "lt"]
  };
  const FIELDS = Object.keys(HEADER_WORDS);

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function text(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function norm(v) { return text(v).toLowerCase().replace(/[\s　]+/g, " "); }
  function hasAny(haystack, words) {
    const h = norm(haystack);
    return (words || []).some(w => { const k = norm(w); return k && h.includes(k); });
  }
  function num(v) {
    if (typeof v === "number") return v;
    const n = Number(text(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  /** Fill missing parts of saved rules from the defaults (older saved rules keep working). */
  function normalizeRules(r) {
    const d = clone(DEFAULT_RULES);
    if (!r || typeof r !== "object") return d;
    const out = Object.assign(d, r);
    out.wire = Object.assign(clone(DEFAULT_RULES.wire), r.wire || {});
    out.specials = Object.assign({}, r.specials || clone(DEFAULT_RULES.specials));
    out.branch = Object.assign(clone(DEFAULT_RULES.branch), r.branch || {});
    out.schema = RULES_SCHEMA;
    return out;
  }

  function headerScore(row) {
    return (row || []).reduce((s, cell) => {
      const c = norm(cell);
      if (!c || c.length > 40) return s;
      return s + (FIELDS.some(f => HEADER_WORDS[f].some(w => c === norm(w) || c.includes(norm(w)))) ? 1 : 0);
    }, 0);
  }

  /** Index of the most header-like row among the first 30 (0 when none looks like a header). */
  function findHeaderRow(rows) {
    let best = 0, bestScore = 0;
    (rows || []).slice(0, 30).forEach((row, i) => {
      const s = headerScore(row);
      if (s > bestScore) { best = i; bestScore = s; }
    });
    return bestScore >= 2 ? best : 0;
  }

  /** { partNo, name, type, qty, leadTime } -> column index or -1. Exact header matches win. */
  function guessColumns(headerRow) {
    const cells = (headerRow || []).map(norm);
    const used = new Set();
    const pick = words => {
      for (const exact of [true, false]) {
        for (const w of words) {
          const k = norm(w);
          const i = cells.findIndex((c, idx) => !used.has(idx) && c && (exact ? c === k : c.includes(k)));
          if (i !== -1) { used.add(i); return i; }
        }
      }
      return -1;
    };
    const out = {};
    // Most specific first, so "part name" is not taken as part no.
    ["partNo", "qty", "leadTime", "type", "name"].forEach(f => { out[f] = pick(HEADER_WORDS[f]); });
    return out;
  }

  /**
   * Analyze BOM rows.
   * mapping: { partNo, name, type, qty, leadTime } column indexes (-1 = not present).
   * Returns { cct, wireRows, specials: { name: rows }, branch, parts, maxLeadTime, rowCount, warnings }.
   */
  function analyze(rows, headerIndex, mapping, rulesIn) {
    const rules = normalizeRules(rulesIn);
    const m = Object.assign({ partNo: -1, name: -1, type: -1, qty: -1, leadTime: -1 }, mapping || {});
    const cell = (row, i) => (i >= 0 ? row[i] : "");
    const items = [];

    (rows || []).slice((headerIndex || 0) + 1).forEach((row, k) => {
      if (!row || !row.length) return;
      const item = {
        line: (headerIndex || 0) + k + 2, // 1-based sheet row number
        partNo: text(cell(row, m.partNo)),
        name: text(cell(row, m.name)),
        type: text(cell(row, m.type)),
        qty: num(cell(row, m.qty)),
        leadTime: num(cell(row, m.leadTime))
      };
      if (!item.partNo && !item.name && !item.type) return; // blank / separator row
      items.push(item);
    });

    const desc = it => it.type + " " + it.name;
    const isWire = it =>
      ((hasAny(desc(it), rules.wire.keywords)) ||
       (rules.wire.partPrefixes || []).some(p => text(p) && norm(it.partNo).startsWith(norm(p)))) &&
      !hasAny(desc(it), rules.wire.exclude);

    const wireRows = items.filter(isWire);
    const cct = rules.wire.countMode === "qty"
      ? wireRows.reduce((s, it) => s + (it.qty || 0), 0)
      : wireRows.length;

    const specials = {};
    Object.keys(rules.specials || {}).forEach(name => {
      const hits = items.filter(it => hasAny(desc(it) + " " + it.partNo, rules.specials[name]));
      if (hits.length) specials[name] = hits;
    });

    const branch = rules.branch.enabled && (rules.branch.keywords || []).length
      ? items.filter(it => hasAny(desc(it), rules.branch.keywords)).length
      : null;

    const parts = items.filter(it => it.partNo);
    const withLt = parts.filter(it => it.leadTime !== null && it.leadTime >= 0);
    const maxLeadTime = withLt.length ? Math.max.apply(null, withLt.map(it => it.leadTime)) : null;

    const warnings = [];
    if (!items.length) warnings.push("No data rows found under the header row.");
    if (m.partNo === -1 && m.name === -1) warnings.push("Neither a part no. nor a name column is selected.");
    if (items.length && !wireRows.length) warnings.push("No wire rows found — check the TYPE / NAME columns and the wire keywords in Rules.");
    if (rules.wire.countMode === "qty" && m.qty === -1) warnings.push("CCT is set to count wire quantity, but no QTY column is selected.");

    return { cct, wireRows, specials, branch, parts, maxLeadTime, rowCount: items.length, warnings };
  }

  /**
   * Planner payload (schema manufacturing-lt/input@1).
   * meta: { drawingNo, revision, customer, qty, startDate, branchCount, specials: [names], fileName }
   */
  function toPlannerPayload(result, meta) {
    const md = meta || {};
    const payload = {
      schema: "manufacturing-lt/input@1",
      wireCount: result.cct,
      specials: md.specials || Object.keys(result.specials || {}),
      source: {
        tool: "PROTO CONTROL Analyzer",
        drawingNo: md.drawingNo || "",
        revision: md.revision || "",
        file: md.fileName || "",
        detected: ["wireCount", "specials"],
        bom: (result.parts || []).map(p => ({ partNo: p.partNo, description: p.name || p.type, qty: p.qty, leadTimeDays: p.leadTime }))
      }
    };
    if (md.customer) payload.customer = md.customer;
    if (Number.isInteger(md.qty) && md.qty > 0) payload.qty = md.qty;
    if (/^\d{4}-\d{2}-\d{2}$/.test(md.startDate || "")) payload.startDate = md.startDate;
    const branch = Number.isInteger(md.branchCount) ? md.branchCount : result.branch;
    if (Number.isInteger(branch) && branch >= 0) {
      payload.branchCount = branch;
      if (!Number.isInteger(md.branchCount)) payload.source.detected.push("branchCount");
    }
    return payload;
  }

  return { RULES_SCHEMA, DEFAULT_RULES, HEADER_WORDS, clone, normalizeRules, findHeaderRow, guessColumns, analyze, toPlannerPayload };
});
