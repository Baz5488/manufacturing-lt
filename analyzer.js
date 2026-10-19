/* PROTO CONTROL Analyzer page. Logic lives in analyzer-core.js; this file is the UI only. */
(function () {
  const A = window.AnalyzerCore;
  const RULES_KEY = "proto_control_analyzer_rules";
  const HANDOFF_KEY = "proto_control_analyzer_handoff"; // read by the Planner (index.html?from=analyzer)
  const MASTER_KEY = "manufacturing_lt_v2_master";      // the Planner's master data in this browser
  const FIELDS = [["partNo", "Part No."], ["name", "Name"], ["type", "Type"], ["qty", "Qty"], ["leadTime", "Lead time (days)"]];

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const notice = (id, msg, cls) => { $(id).innerHTML = msg ? `<div class="notice ${cls}">${msg}</div>` : ""; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  let rules = A.normalizeRules(store.get(RULES_KEY));
  let workbook = null, fileName = "", rows = [], headerIndex = 0, mapping = {}, result = null;

  function master() {
    const m = store.get(MASTER_KEY);
    return m && m.customers && m.specials ? m : (window.LTCore ? LTCore.clone(LTCore.DEFAULT_MASTER) : { customers: [], specials: [] });
  }
  function colLabel(i) { let s = ""; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

  // ---------- file ----------
  function decodeCsv(buffer) {
    // Japanese CSVs are often Shift-JIS: try strict UTF-8 first.
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch (e) { return new TextDecoder("shift_jis").decode(buffer); }
  }
  function loadFile(file) {
    if (!file) return;
    fileName = file.name;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        workbook = /\.csv$/i.test(file.name)
          ? XLSX.read(decodeCsv(rd.result), { type: "string", raw: true })
          : XLSX.read(rd.result, { type: "array", cellDates: true });
      } catch (e) {
        workbook = null;
        return notice("fileNotice", "Could not read this file: " + esc(e.message), "bad");
      }
      $("sheet").innerHTML = workbook.SheetNames.map(n => `<option>${esc(n)}</option>`).join("");
      if (!$("drawingNo").value) $("drawingNo").value = file.name.replace(/\.[^.]+$/, "");
      loadSheet();
    };
    rd.readAsArrayBuffer(file);
  }
  function loadSheet() {
    if (!workbook) return;
    const ws = workbook.Sheets[$("sheet").value];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
    headerIndex = A.findHeaderRow(rows);
    $("headerRow").value = headerIndex + 1;
    mapping = A.guessColumns(rows[headerIndex]);
    renderMapping();
    run();
  }
  function renderMapping() {
    const header = rows[headerIndex] || [];
    const width = rows.slice(headerIndex, headerIndex + 50).reduce((w, r) => Math.max(w, (r || []).length), header.length);
    const options = sel => `<option value="-1">— none —</option>` + Array.from({ length: width }, (_, i) =>
      `<option value="${i}" ${i === sel ? "selected" : ""}>${colLabel(i)}: ${esc(String(header[i] ?? "").slice(0, 24))}</option>`).join("");
    $("mapping").innerHTML = FIELDS.map(([f, label]) =>
      `<div class="field"><label class="muted">${label}</label><select data-field="${f}">${options(mapping[f])}</select></div>`).join("");
    $("mapping").querySelectorAll("select").forEach(s => s.onchange = () => { mapping[s.dataset.field] = Number(s.value); run(); });
  }

  // ---------- analysis ----------
  function run() {
    if (!rows.length) return;
    result = A.analyze(rows, headerIndex, mapping, rules);
    $("cct").textContent = result.cct;
    $("rowCount").textContent = `${result.rowCount} / ${result.parts.length}`;
    $("maxLt").textContent = result.maxLeadTime === null ? "—" : result.maxLeadTime + " days";
    renderSpecials(true);
    renderPreview();
    const warn = result.warnings.map(esc).join("<br>");
    notice("fileNotice", warn ? "⚠️ " + warn : `✓ ${esc(fileName)}: header on row ${headerIndex + 1}, ${result.wireRows.length} wire row(s) → CCT ${result.cct}.`, warn ? "warn" : "good");
    $("sendBtn").disabled = $("jsonBtn").disabled = !(result.cct > 0);
    notice("resultNotice", "", "");
  }
  function renderSpecials(fromResult) {
    const keep = new Set([...document.querySelectorAll("#specials input:checked")].map(x => x.value));
    $("specials").innerHTML = master().specials.map(([name, days]) => {
      const hits = (result && result.specials[name]) || [];
      const checked = fromResult ? hits.length > 0 : keep.has(name);
      const found = hits.length ? ` <span class="muted">found: ${esc(hits.slice(0, 3).map(h => h.partNo || h.name).join(", "))}${hits.length > 3 ? "…" : ""}</span>` : "";
      return `<label class="check"><input type="checkbox" value="${esc(name)}" ${checked ? "checked" : ""}> ${esc(name)} <span class="muted">(+${esc(days)} days)</span>${found}</label>`;
    }).join("");
  }
  function renderPreview() {
    const wires = new Set(result.wireRows.map(w => w.line));
    const width = Math.max(...rows.slice(headerIndex, headerIndex + 200).map(r => (r || []).length), 1);
    const cells = r => Array.from({ length: width }, (_, i) => `<td>${esc(fmtCell(r[i]))}</td>`).join("");
    const body = rows.slice(headerIndex, headerIndex + 201).map((r, k) => {
      const line = headerIndex + k + 1;
      return `<tr class="${k === 0 ? "hdr" : wires.has(line) ? "wire" : ""}"><td class="muted">${line}</td>${cells(r || [])}</tr>`;
    }).join("");
    $("preview").innerHTML = `<table><tbody>${body}</tbody></table>`;
  }
  function fmtCell(v) {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    return v;
  }

  // ---------- output ----------
  function payload() {
    const n = id => { const v = $(id).value; return v === "" ? null : Number(v); };
    return A.toPlannerPayload(result, {
      drawingNo: $("drawingNo").value.trim(),
      revision: $("revision").value.trim(),
      customer: $("customer").value,
      qty: n("qty"),
      branchCount: n("branch"),
      startDate: $("startDate").value,
      specials: [...document.querySelectorAll("#specials input:checked")].map(x => x.value),
      fileName
    });
  }
  function send() {
    if (!result || !(result.cct > 0)) return;
    if (!store.set(HANDOFF_KEY, { at: new Date().toISOString(), payload: payload() })) {
      return notice("resultNotice", "Could not hand over to the Planner (browser storage blocked). Use Download input JSON instead.", "bad");
    }
    location.href = "./?from=analyzer";
  }
  function downloadJson() {
    if (!result) return;
    const p = payload();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }));
    a.download = (p.source.drawingNo || "bom") + "_planner_input.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  // ---------- rules ----------
  const lines = t => t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  function renderRules() {
    $("wireKeywords").value = rules.wire.keywords.join("\n");
    $("wireExclude").value = rules.wire.exclude.join("\n");
    $("wirePrefixes").value = rules.wire.partPrefixes.join("\n");
    $("countMode").value = rules.wire.countMode;
    const names = [...new Set(master().specials.map(s => s[0]).concat(Object.keys(rules.specials)))];
    $("specialRules").innerHTML = `<div class="form-row">` + names.map(n =>
      `<div class="field"><label>${esc(n)} keywords</label><textarea data-special="${esc(n)}">${esc((rules.specials[n] || []).join("\n"))}</textarea></div>`).join("") + `</div>`;
  }
  function readRules() {
    const specials = {};
    document.querySelectorAll("#specialRules textarea").forEach(t => { const k = lines(t.value); if (k.length) specials[t.dataset.special] = k; });
    return A.normalizeRules({
      wire: { keywords: lines($("wireKeywords").value), exclude: lines($("wireExclude").value), partPrefixes: lines($("wirePrefixes").value), countMode: $("countMode").value },
      specials,
      branch: rules.branch
    });
  }
  function saveRules() {
    rules = readRules();
    store.set(RULES_KEY, rules);
    notice("rulesNotice", "✓ Rules saved.", "good");
    run();
  }

  // ---------- init ----------
  function init() {
    const m = master();
    $("customer").innerHTML = '<option value="">-- Select customer --</option>' + m.customers.map(c => `<option>${esc(c[0])}</option>`).join("");
    const d = new Date();
    $("startDate").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    renderSpecials(false);
    renderRules();

    $("bomFile").onchange = e => loadFile(e.target.files[0]);
    $("sheet").onchange = loadSheet;
    $("headerRow").onchange = () => {
      const v = Math.max(1, Math.min(rows.length, Number($("headerRow").value) || 1));
      headerIndex = v - 1; $("headerRow").value = v;
      mapping = A.guessColumns(rows[headerIndex]);
      renderMapping(); run();
    };
    $("sendBtn").onclick = send;
    $("jsonBtn").onclick = downloadJson;
    $("saveRules").onclick = saveRules;
    $("resetRules").onclick = () => { if (confirm("Reset the detection rules to the default?")) { rules = A.normalizeRules(null); store.set(RULES_KEY, rules); renderRules(); run(); notice("rulesNotice", "Rules reset to default.", "good"); } };
    $("exportRules").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(readRules(), null, 2)], { type: "application/json" }));
      a.download = "proto_control_analyzer_rules.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
    };
    $("importRulesBtn").onclick = () => $("importRules").click();
    $("importRules").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { const r = JSON.parse(rd.result); if (!r.wire) throw new Error("not a rules file"); rules = A.normalizeRules(r); store.set(RULES_KEY, rules); renderRules(); run(); notice("rulesNotice", "✓ Rules imported.", "good"); }
        catch (err) { notice("rulesNotice", "Invalid rules file.", "bad"); }
        finally { e.target.value = ""; }
      };
      rd.readAsText(f);
    };
  }
  init();
})();
