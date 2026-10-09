/*
 * Manufacturing LT core: master data defaults, input contract and the
 * lead-time formula, with no DOM access. Shared by the calculator UI and
 * any upstream tool (e.g. a BOM analyzer / harness topology model).
 *
 * Browser: <script src="lt-core.js"></script> → window.LTCore
 * Node:    const LTCore = require("./lt-core.js")
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LTCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const INPUT_SCHEMA = "manufacturing-lt/input@1";

  const DEFAULT_MASTER = {
    cct: [
      {label:"1–50",min:1,max:50,baseWeeks:4,baseDays:28,drawingDays:3},
      {label:"51–100",min:51,max:100,baseWeeks:6,baseDays:42,drawingDays:5},
      {label:"101–300",min:101,max:300,baseWeeks:8,baseDays:56,drawingDays:7},
      {label:"301–500",min:301,max:500,baseWeeks:10,baseDays:70,drawingDays:10},
      {label:"501–1000",min:501,max:1000,baseWeeks:12,baseDays:84,drawingDays:15},
      {label:">1000",min:1001,max:null,baseWeeks:null,baseDays:null,drawingDays:20}
    ],
    customers: [
      ["HITACHI",2],["KOBELCO",1],["SUMITOMO",2],["YAMATO",3],["CATERPILLAR",1],["TAKEUCHI",2],
      ["KOMATSU",4],["MITSUBISHI THERMAL",3],["SAKAI",2],["TOHATSU",2],["GAC",2],["KYOEISHA",2],
      ["KATO",3],["YAMABIKO",3],["Mitsubishi Logi",2],["GIKEN",3],["HSC",3],["KUBOTA",3]
    ],
    difficulty: [
      {level:1,name:"Easy",buffer:0},{level:2,name:"Medium",buffer:2},{level:3,name:"Hard",buffer:5},
      {level:4,name:"Very Hard",buffer:7},{level:5,name:"Extremely Hard",buffer:null}
    ],
    specials: [["Marker",4],["Ethernet",3],["Braiding",1],["Solder",2]],
    branchLevels: [
      {label:"0–10",min:0,max:10,level:1},
      {label:"11–30",min:11,max:30,level:2},
      {label:"31–60",min:31,max:60,level:3},
      {label:">60",min:61,max:null,level:4}
    ],
    quantityFactors: [
      {label:"1 pc",min:1,max:1,factor:1.00},
      {label:"2–10 pcs",min:2,max:10,factor:1.10},
      {label:"11–50 pcs",min:11,max:50,factor:1.20},
      {label:"51–100 pcs",min:51,max:100,factor:1.30},
      {label:">100 pcs",min:101,max:null,factor:1.50}
    ]
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Fill sections that older saved/exported master data may be missing.
  function normalizeMaster(m) {
    if (!m.quantityFactors) m.quantityFactors = clone(DEFAULT_MASTER.quantityFactors);
    if (!m.branchLevels) m.branchLevels = clone(DEFAULT_MASTER.branchLevels);
    return m;
  }

  function inRange(n, r) { return n >= r.min && (r.max === null || n <= r.max); }
  function findCctRule(m, cct) { return m.cct.find(r => inRange(cct, r)); }
  function findBranchLevel(m, n) { return m.branchLevels.find(r => inRange(n, r)); }
  function findQtyFactor(m, qty) { return m.quantityFactors.find(r => inRange(qty, r)); }
  function findCustomer(m, name) {
    const key = String(name ?? "").trim().toLowerCase();
    return m.customers.find(c => c[0].toLowerCase() === key);
  }
  function findDifficulty(m, level) { return m.difficulty.find(d => d.level === Number(level)); }

  function toInt(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : NaN;
  }
  function addDays(isoDate, days) {
    const [y, mo, d] = isoDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d + days));
    return dt.toISOString().slice(0, 10);
  }

  /*
   * Map an upstream payload (schema manufacturing-lt/input@1) to calculator
   * inputs. Unknown customer / special names become warnings, not errors,
   * so a person can correct them in the UI.
   *
   * Payload:
   * {
   *   schema: "manufacturing-lt/input@1",
   *   customer: "KOBELCO",
   *   wireCount: 180,          // = CCT count (alias: cct)
   *   branchCount: 25,         // alias: branch
   *   qty: 20,
   *   startDate: "2026-10-09",
   *   specials: ["Marker", "Braiding"],
   *   source: {                // optional, kept for traceability
   *     drawingNo: "WH-12345", revision: "B", tool: "BOM Analyzer",
   *     detected: ["wireCount", "branchCount", "specials"],
   *     bom: [ { partNo, description, qty, leadTimeDays } ]  // not used in LT yet
   *   }
   * }
   */
  function parseInput(payload, m) {
    const p = payload || {};
    const warnings = [];
    if (p.schema && p.schema !== INPUT_SCHEMA) warnings.push(`Unknown schema "${p.schema}"; expected "${INPUT_SCHEMA}".`);
    const out = {
      customer: null,
      cct: toInt(p.wireCount ?? p.cct),
      branch: toInt(p.branchCount ?? p.branch),
      qty: toInt(p.qty),
      startDate: typeof p.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : null,
      specials: [],
      source: p.source && typeof p.source === "object" ? p.source : null
    };
    if (p.customer !== undefined) {
      const c = findCustomer(m, p.customer);
      if (c) out.customer = c[0];
      else warnings.push(`Customer "${p.customer}" is not in Master Data.`);
    }
    const names = Array.isArray(p.specials) ? p.specials : typeof p.specials === "string" ? p.specials.split(",") : [];
    for (const raw of names) {
      const name = String(raw).trim();
      if (!name) continue;
      const s = m.specials.find(x => x[0].toLowerCase() === name.toLowerCase());
      if (s) out.specials.push(s[0]);
      else warnings.push(`Special treatment "${name}" is not in Master Data.`);
    }
    for (const k of ["cct", "branch", "qty"]) if (Number.isNaN(out[k])) { warnings.push(`Ignored non-integer ${k}.`); out[k] = null; }
    return { inputs: out, warnings };
  }

  /*
   * inputs: { cct, branch, qty, customer, specials: [names], startDate }
   * returns { status: "ok" | "review" | "error", errors: [], ...breakdown }
   */
  function calcLeadTime(inputs, m) {
    const { cct, branch, qty, customer, startDate } = inputs;
    const err = msg => ({ status: "error", errors: [msg] });
    if (!Number.isInteger(cct) || cct < 1) return err("Enter a valid CCT count.");
    if (!Number.isInteger(branch) || branch < 0) return err("Enter a valid branch count (0 or more).");
    if (!Number.isInteger(qty) || qty < 1) return err("Enter a valid manufacturing quantity.");
    if (!customer) return err("Select a customer.");
    if (!startDate) return err("Select a start date.");

    const c = findCustomer(m, customer);
    if (!c) return err(`Customer "${customer}" is not in Master Data.`);
    const rule = findCctRule(m, cct);
    if (!rule) return err("No CCT range matches this CCT count. Check Master Data.");
    const bl = findBranchLevel(m, branch);
    if (!bl) return err("No branch count level matches this branch count. Check Master Data.");
    const customerLevel = Number(c[1]), branchLevel = Number(bl.level);
    const appliedLevel = Math.max(customerLevel, branchLevel);
    const d = findDifficulty(m, appliedLevel);
    if (!d) return err(`Difficulty level ${appliedLevel} is not defined in Master Data.`);
    const levelSource = customerLevel === branchLevel ? "customer & branch" : appliedLevel === customerLevel ? "customer" : "branch count";

    const specials = (inputs.specials || []).map(n => m.specials.find(s => s[0] === n)).filter(Boolean);
    const specialDays = specials.reduce((s, x) => s + Number(x[1]), 0);
    const qf = findQtyFactor(m, qty);

    const result = {
      status: "ok", errors: [],
      customer: c[0], cct, branch, qty, startDate,
      cctRule: rule, branchRule: bl, customerLevel, branchLevel, appliedLevel, levelSource, difficulty: d,
      specials: specials.map(s => s[0]), specialDays, qtyFactor: qf || null,
      preQtyLT: null, totalLT: null, etd: null
    };
    if (rule.baseDays === null || d.buffer === null || !qf) {
      result.status = "review";
      return result;
    }
    result.preQtyLT = rule.baseDays + rule.drawingDays + d.buffer + specialDays;
    result.totalLT = Math.ceil(result.preQtyLT * Number(qf.factor));
    result.etd = addDays(startDate, result.totalLT);
    return result;
  }

  return { INPUT_SCHEMA, DEFAULT_MASTER, clone, normalizeMaster, findCustomer, findBranchLevel, findDifficulty, parseInput, calcLeadTime };
});
