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
    specials: [["Marker",4],["Ethernet",3],["Braiding",1],["Solder",2],["Rocket",-14]],
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
  // Special treatments added to the defaults later: put into saved master data once (kept out if renamed or changed later).
  const ADDED_SPECIALS = [["Rocket", -14]];

  function normalizeMaster(m) {
    if (!m.quantityFactors) m.quantityFactors = clone(DEFAULT_MASTER.quantityFactors);
    if (!m.branchLevels) m.branchLevels = clone(DEFAULT_MASTER.branchLevels);
    if (!Array.isArray(m.addedSpecials)) m.addedSpecials = [];
    for (const [name, days] of ADDED_SPECIALS) {
      if (m.addedSpecials.includes(name)) continue;
      if (!m.specials.some(s => String(s[0]).toLowerCase() === name.toLowerCase())) m.specials.push([name, days]);
      m.addedSpecials.push(name);
    }
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
    // Buffers (positive days) are added before the quantity factor. Shortening treatments (negative days, e.g.
    // Rocket -14) come off after it, scaled by (2 - factor) and never below 0: a bigger lot is harder to rush
    // (factor 1.5 -> -7 days, factor 2.0 or more -> 0).
    const specialDays = specials.reduce((s, x) => s + Math.max(0, Number(x[1])), 0);
    const shortenDays = specials.reduce((s, x) => s + Math.min(0, Number(x[1])), 0);
    const qf = findQtyFactor(m, qty);

    const result = {
      status: "ok", errors: [],
      customer: c[0], cct, branch, qty, startDate,
      cctRule: rule, branchRule: bl, customerLevel, branchLevel, appliedLevel, levelSource, difficulty: d,
      specials: specials.map(s => s[0]), specialDays, shortenDays, shortenScale: null, reductionDays: 0, qtyFactor: qf || null,
      preQtyLT: null, totalLT: null, etd: null
    };
    if (rule.baseDays === null || d.buffer === null || !qf) {
      result.status = "review";
      return result;
    }
    result.preQtyLT = rule.baseDays + rule.drawingDays + d.buffer + specialDays;
    result.shortenScale = Math.max(0, 2 - Number(qf.factor));
    result.reductionDays = Math.round(-shortenDays * result.shortenScale);
    result.totalLT = Math.max(1, Math.ceil(result.preQtyLT * Number(qf.factor)) - result.reductionDays);
    result.etd = addDays(startDate, result.totalLT);
    // Rocket = must-achieve short-LT service: the ETD above (with Rocket's days) is the latest allowed date;
    // an earlier ETD is better when capacity allows, but not before drawing breakdown + one production week.
    if (result.specials.some(n => n.toLowerCase() === ROCKET)) {
      result.rocket = { deadline: result.etd, floor: addDays(startDate, rule.drawingDays + ROCKET_MIN_PRODUCTION_DAYS) };
    }
    return result;
  }

  /*
   * Capacity check against the PROTO CONTROL Tracker capacity feed (schema assy-finder/capacity@1;
   * the id is kept from the Tracker's former name, ASSY FINDER, so existing links keep working):
   * {
   *   capacity: { P: { value, stat: "median" | "average" }, E: {...}, "-": {...}, "/": {...}, TOTAL: {...} },  // CCT x QTY per week
   *              (feeds from before v2.8 send only { average }; it is used when `value` is missing)
   *   etds: [ { etd: "2026-10-23", overdue: false, byType: { P: 1900, E: 700 } } ],  // CCT x QTY already booked
   *   today: "2026-10-19"   // unfinished items with a past ETD (overdue) are booked in this week
   * }
   * order: { load: CCT x QTY, wpType: "P" | "E" | "-" | "/" | "" (= all, TOTAL capacity), earliest: "YYYY-MM-DD" }
   * Finds the first weekly ETD on or after `earliest` whose free capacity (capacity - booked) fits the load.
   * ETDs in the same week (Mon-Sun) share one week's capacity. Load a week cannot finish (overdue backlog, overfull
   * weeks) is carried into the following weeks. Weeks beyond the feed have only carried load.
   */
  const WEEK_MS = 7 * 86400000;
  const ROCKET = "rocket";
  const ROCKET_MIN_PRODUCTION_DAYS = 7;
  function isoToUTC(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); }
  function utcToIso(t) { return new Date(t).toISOString().slice(0, 10); }
  function weekStartUTC(t) { const day = new Date(t).getUTCDay(); return t - ((day + 6) % 7) * 86400000; }

  /** Booked CCT x QTY per week (Monday, UTC ms) for a WP type ("" = all), and the usual ETD weekday (default Friday). */
  function bookedLoad(feed, type) {
    // Booked load per week, and the usual ETD weekday (most common among upcoming ETDs; default Friday).
    const bookedByWeek = {};
    const weekdayCount = {};
    (feed.etds || []).forEach(e => {
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.etd || "")) return;
      const t = isoToUTC(e.etd);
      const by = e.byType || {};
      const booked = type ? Number(by[type]) || 0 : Object.keys(by).reduce((s, k) => s + (Number(by[k]) || 0), 0);
      // Overdue (past ETD, unfinished) load still has to be produced: book it in the current week.
      const todayOk = /^\d{4}-\d{2}-\d{2}$/.test(feed.today || "");
      const wk = e.overdue && todayOk ? weekStartUTC(isoToUTC(feed.today)) : weekStartUTC(t);
      bookedByWeek[wk] = (bookedByWeek[wk] || 0) + booked;
      if (!e.overdue) { const wd = new Date(t).getUTCDay(); weekdayCount[wd] = (weekdayCount[wd] || 0) + 1; }
    });
    const etdWeekday = Number(Object.keys(weekdayCount).sort((a, b) => weekdayCount[b] - weekdayCount[a])[0] ?? 5);
    return { bookedByWeek, etdWeekday };
  }

  /**
   * Load per week with overload carried forward: a week's load = its own ETDs + what earlier weeks could not finish
   * (from the current week on). Returns week (UTC ms) -> { booked, carriedIn }.
   */
  function weekQueue(feed, bookedByWeek, capacity) {
    const weeks = Object.keys(bookedByWeek).map(Number);
    const todayOk = /^\d{4}-\d{2}-\d{2}$/.test(feed.today || "");
    const starts = weeks.concat(todayOk ? [weekStartUTC(isoToUTC(feed.today))] : []);
    let wk = starts.length ? Math.min.apply(null, starts) : Infinity; // nothing booked: nothing to carry
    let carry = 0;
    const done = {};
    return function at(week) {
      while (wk <= week) {
        const booked = (bookedByWeek[wk] || 0) + carry;
        done[wk] = { booked, carriedIn: carry };
        carry = Math.max(0, booked - capacity);
        wk += WEEK_MS;
      }
      return done[week] || { booked: bookedByWeek[week] || 0, carriedIn: 0 };
    };
  }

  function capacityOf(feed, type) {
    const capKey = type || "TOTAL";
    const cap = (feed && feed.capacity && feed.capacity[capKey]) || {};
    return { capKey, capacity: Number(cap.value ?? cap.average) || 0, stat: cap.value !== undefined ? (cap.stat || "median") : "average" };
  }

  /*
   * Rocket order: order = { load, wpType, floor: "YYYY-MM-DD", deadline: "YYYY-MM-DD" }.
   * Looks at every week from `floor` to `deadline` (the standard Rocket ETD, which must be met) and suggests the
   * earliest ETD whose free capacity fits the load. The last slot is the deadline itself when the usual ETD weekday
   * falls after it. When nothing fits, the deadline is kept (status "short") with the CCT missing in its week.
   */
  function planRocket(feed, order) {
    const type = order.wpType || "";
    const { capKey, capacity, stat } = capacityOf(feed, type);
    const need = Math.max(0, Number(order.load) || 0);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(order.floor || "") || !iso.test(order.deadline || "")) return { status: "error", error: "No Rocket dates." };
    const base = { type: capKey, capacity, stat, need, floor: order.floor, deadline: order.deadline };
    if (capacity <= 0) return Object.assign(base, { status: "no-capacity", candidates: [], suggested: null });

    const { bookedByWeek, etdWeekday } = bookedLoad(feed, type);
    const queue = weekQueue(feed, bookedByWeek, capacity);
    const deadline = isoToUTC(order.deadline);
    let t = Math.min(isoToUTC(order.floor), deadline);
    while (new Date(t).getUTCDay() !== etdWeekday) t += 86400000;
    const candidates = [];
    for (let wk = weekStartUTC(Math.min(t, deadline)); wk <= weekStartUTC(deadline); wk += WEEK_MS) {
      const day = Math.min(Math.max(wk + ((etdWeekday + 6) % 7) * 86400000, t), deadline);
      const { booked, carriedIn } = queue(wk);
      const free = capacity - booked;
      candidates.push({ etd: utcToIso(day), booked, carriedIn, free, fits: free >= need });
    }
    const suggested = candidates.find(c => c.fits) || null;
    const last = candidates[candidates.length - 1];
    return Object.assign(base, {
      status: suggested ? "ok" : "short",
      daysEarlier: suggested ? Math.round((deadline - isoToUTC(suggested.etd)) / 86400000) : 0,
      shortBy: suggested ? 0 : Math.max(0, need - last.free),
      suggested, candidates
    });
  }

  function planCapacity(feed, order, options) {
    const opt = Object.assign({ weeks: 26, show: 6 }, options || {});
    const type = order.wpType || "";
    const { capKey, capacity, stat } = capacityOf(feed, type);
    const need = Math.max(0, Number(order.load) || 0);
    if (!order.earliest || !/^\d{4}-\d{2}-\d{2}$/.test(order.earliest)) return { status: "error", error: "No earliest ETD." };
    if (capacity <= 0) return { status: "no-capacity", type: capKey, capacity: 0, stat, need, candidates: [], suggested: null };

    const { bookedByWeek, etdWeekday } = bookedLoad(feed, type);
    const queue = weekQueue(feed, bookedByWeek, capacity);

    // First ETD weekday on or after `earliest`.
    let t = isoToUTC(order.earliest);
    while (new Date(t).getUTCDay() !== etdWeekday) t += 86400000;

    const candidates = [];
    let suggested = null;
    for (let i = 0; i < opt.weeks; i++, t += WEEK_MS) {
      const { booked, carriedIn } = queue(weekStartUTC(t));
      const free = capacity - booked;
      const row = { etd: utcToIso(t), booked, carriedIn, free, fits: free >= need };
      if (candidates.length < opt.show) candidates.push(row);
      if (!suggested && row.fits) { suggested = row; if (candidates.length >= opt.show) break; }
    }
    return {
      status: need > capacity ? "too-big" : suggested ? "ok" : "full",
      type: capKey, capacity, stat, need, etdWeekday,
      weeksNeeded: Math.ceil(need / capacity),
      suggested, candidates
    };
  }

  // ---------- PROTO CONTROL Analyzer (desktop Harness BOM Analyzer) results ----------
  // Same customer / special-treatment hints as the Analyzer's quick_customers.json.
  const ANALYZER_HINTS = {
    customers: {
      "HITACHI": { keywords: ["HITACHI", "日立建機", "Hitachi Construction Machinery"], prefixes: ["YA", "HF"] },
      "KOBELCO": { keywords: ["KOBELCO", "コベルコ", "神戸製鋼"], prefixes: [] },
      "SUMITOMO": { keywords: ["SUMITOMO", "住友建機"], prefixes: [] },
      "YAMATO": { keywords: ["YAMATO", "ヤマト"], prefixes: [] },
      "CATERPILLAR": { keywords: ["CATERPILLAR", "キャタピラー"], prefixes: [] },
      "TAKEUCHI": { keywords: ["TAKEUCHI", "竹内製作所"], prefixes: ["03742"] },
      "KOMATSU": { keywords: ["KOMATSU", "コマツ", "小松製作所"], prefixes: [] },
      "MITSUBISHI THERMAL": { keywords: ["MITSUBISHI THERMAL", "三菱重工サーマル", "MITSUBISHI HEAVY INDUSTRIES THERMAL"], prefixes: ["TNA", "TNC"] },
      "SAKAI": { keywords: ["SAKAI", "酒井重工"], prefixes: ["B439"] },
      "TOHATSU": { keywords: ["TOHATSU", "トーハツ"], prefixes: [] },
      "GAC": { keywords: ["GAC"], prefixes: [] },
      "KYOEISHA": { keywords: ["KYOEISHA", "共栄社"], prefixes: [] },
      "KATO": { keywords: ["KATO WORKS", "加藤製作所", "KATO"], prefixes: ["81E"] },
      "YAMABIKO": { keywords: ["YAMABIKO", "やまびこ"], prefixes: [] },
      "Mitsubishi Logi": { keywords: ["MITSUBISHI LOGISNEXT", "三菱ロジスネクスト"], prefixes: [] },
      "GIKEN": { keywords: ["GIKEN", "技研製作所"], prefixes: [] },
      "HSC": { keywords: ["HSC CRANES", "HSC", "日立住友重機械建機クレーン"], prefixes: ["YL"] },
      "KUBOTA": { keywords: ["KUBOTA", "クボタ"], prefixes: [] }
    },
    specials: {
      Marker: ["marking tube", "marker tube", "マークチューブ", "マーカーチューブ", "wire marker"],
      Ethernet: ["ethernet", "イーサネット", "cat5", "cat6", "rj45"],
      Braiding: ["braided tub", "braided sleev", "twisttube", "twist tube", "編組チューブ", "expandable braid"],
      Solder: ["solder", "はんだ", "半田"]
    },
    branchBasis: "branch_segments" // = calculator_branch_count in quick_customers.json
  };

  const str = v => (v === null || v === undefined ? "" : String(v).trim());
  const intOf = v => { const m = str(v).match(/^\d+$/); return m ? Number(m[0]) : null; };

  /** Customer from the title-block company / title, else the drawing-number prefix (as the Analyzer's quick check). */
  function analyzerCustomer(tb, hints) {
    const text = (str(tb.company) + " " + str(tb.title)).toLowerCase();
    let best = null;
    for (const [name, c] of Object.entries(hints.customers)) {
      for (const k of c.keywords || []) if (k && text.includes(k.toLowerCase()) && (!best || k.length > best[0])) best = [k.length, name, `title-block company "${str(tb.company)}"`];
    }
    if (best) return { name: best[1], how: best[2] };
    const dno = str(tb.drawing_number).toUpperCase();
    for (const [name, c] of Object.entries(hints.customers)) {
      for (const p of c.prefixes || []) if (p && dno.startsWith(p.toUpperCase()) && (!best || p.length > best[0])) best = [p.length, name, `drawing number prefix ${p}…`];
    }
    return best ? { name: best[1], how: best[2] } : null;
  }

  /**
   * Analyzer result (work/<drawing>/result.json, or analyzerWorkbookToResult()) -> input@1 payload.
   * CCT = process CCT (factory QTY CCT), else cut wire pieces, else the count printed on the drawing (flagged).
   */
  function fromAnalyzerResult(result, hintsIn) {
    const hints = hintsIn || ANALYZER_HINTS;
    const r = result || {};
    const tb = r.title_block || {};
    const payload = { schema: INPUT_SCHEMA, source: { tool: "BOM Analyzer (result file)", drawingNo: str(tb.drawing_number), revision: str(tb.revision), detected: [] } };
    const src = payload.source;
    const notes = [];

    let cct = intOf(tb.process_cct), cctSource = str(tb.process_cct_source);
    if (cct === null && intOf(tb.wire_count) !== null) { cct = intOf(tb.wire_count); cctSource = str(tb.wire_count_source) || "wire count"; }
    if (cct === null) {
      const m = str(tb.printed_wire_count).match(/\d+/);
      if (m) { cct = Number(m[0]); cctSource = `printed on the drawing ('${str(tb.printed_wire_count)}') - not the factory process CCT`; }
    }
    if (cct !== null) { payload.wireCount = cct; src.detected.push("wireCount"); src.cctSource = cctSource; }
    else notes.push("The result has no process CCT - enter the CCT count by hand.");

    const other = hints.branchBasis === "branch_points" ? "branch_segments" : "branch_points";
    const branch = intOf(tb[hints.branchBasis]) ?? intOf(tb[other]);
    if (branch !== null) {
      payload.branchCount = branch; src.detected.push("branchCount");
      src.branchSource = (intOf(tb[hints.branchBasis]) !== null ? hints.branchBasis : other).replace("_", " ") + (str(tb.branch_source) ? ": " + str(tb.branch_source) : "");
    } else notes.push("The result has no branch count - enter it by hand.");

    const cust = analyzerCustomer(tb, hints);
    if (cust) { payload.customer = cust.name; src.detected.push("customer"); src.customerSource = cust.how; }

    const texts = (r.notes || []).map(str).concat((r.bom || []).map(b => `${str(b.description)} ${str(b.remarks)} ${str(b.specification)}`));
    const specials = [], evidence = {};
    for (const [name, words] of Object.entries(hints.specials)) {
      for (const t of texts) {
        const w = words.find(w => t.toLowerCase().includes(w.toLowerCase()));
        if (w) { specials.push(name); const i = t.toLowerCase().indexOf(w.toLowerCase()); evidence[name] = t.slice(Math.max(0, i - 40), i + w.length + 60).trim(); break; }
      }
    }
    payload.specials = specials; src.detected.push("specials"); src.specialsEvidence = evidence;

    src.bom = (r.bom || []).filter(b => str(b.part_number) || str(b.description)).map(b => ({
      partNo: str(b.part_number), companyPn: str(b.company_pn), description: str(b.description) || str(b.specification),
      category: str(b.category), qty: Number.isFinite(Number(b.quantity)) && str(b.quantity) !== "" ? Number(b.quantity) : null
    }));
    src.notes = notes;
    return payload;
  }

  /** The Analyzer's exported "<drawing>_BOM.xlsx" (sheets as arrays of rows) -> a result-like object for fromAnalyzerResult(). */
  function analyzerWorkbookToResult(sheets) {
    const bomSheet = sheets.BOM || sheets[Object.keys(sheets)[0]] || [];
    const labels = {
      "drawing no.": "drawing_number", "title": "title", "model": "model", "rev.": "revision", "company": "company",
      "wire count": "wire_count", "process cct": "process_cct", "circuits": "circuit_count",
      "wire count printed": "printed_wire_count", "branch points": "branch_points", "branch segments": "branch_segments"
    };
    const sourceOf = { wire_count: "wire_count_source", process_cct: "process_cct_source", branch_points: "branch_source" };
    const tb = {}, bom = [];
    let header = -1;
    bomSheet.forEach((row, i) => {
      const a = str(row && row[0]).toLowerCase();
      if (header < 0) {
        if (a === "category") { header = i; return; }
        const k = labels[a];
        if (!k) return;
        const v = str(row[1]);
        tb[k] = v === "(not printed on drawing)" ? "" : v;
        if (sourceOf[k] && str(row[2])) tb[sourceOf[k]] = str(row[2]);
        return;
      }
      if (!row || !row.some(c => str(c))) return;
      const [category, part_number, company_pn, description, specification, quantity, unit, used_at, remarks] = row.map(str);
      bom.push({ category, part_number, company_pn, description, specification, quantity, unit, used_at, remarks });
    });
    if (header < 0 && !Object.keys(tb).length) throw new Error("This is not a BOM Analyzer workbook (no BOM sheet with Drawing No. / Category).");
    const notes = [];
    let inNotes = false;
    for (const row of sheets.Check || []) {
      const a = str(row && row[0]);
      if (a === "Notes") { inNotes = true; continue; }
      if (inNotes && a) notes.push(a);
    }
    return { title_block: tb, bom, notes };
  }

  return { INPUT_SCHEMA, DEFAULT_MASTER, ANALYZER_HINTS, fromAnalyzerResult, analyzerWorkbookToResult, clone, normalizeMaster, findCustomer, findBranchLevel, findDifficulty, parseInput, calcLeadTime, planCapacity, planRocket };
});
