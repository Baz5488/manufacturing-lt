# Manufacturing Lead Time Calculator v2

Static PWA for GitHub Pages.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `manufacturing-lt`.
2. Upload these files to the repository root:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon.svg`
   - `lt-core.js`
3. In GitHub: **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select `main` and `/ (root)`, then Save.
6. GitHub will provide the Pages URL.

## Notes

- No backend is required.
- Master data and history are stored in the user's browser using localStorage.
- Use Master Data → Export JSON to back up the rules.
- Use History → Export CSV to export calculations.
- Current ETD calculation uses calendar days.


## V2.3 update
- Added **Back to Top** navigation for History and Master Data pages.
- Bumped the service-worker cache to `mfg-lt-v2-3`.

## V2.4 update
- Added **Set Current Data as Default** in Master Data. The saved data is used by **Reset Master Data to Default** (and for a fresh start) instead of the built-in rules.
- Added **Restore Factory Default** to remove the saved custom default and go back to the built-in rules.
- The custom default is stored in this browser only (localStorage). Use Export JSON to share it with other devices.
- Bumped the service-worker cache to `mfg-lt-v2-4`.

## V2.5 update
- Added **Branch Count** input to the calculator.
- Branch count maps to a level (0–10 → L1, 11–30 → L2, 31–60 → L3, >60 → L4), editable in Master Data → Branch Count Levels.
- The applied difficulty level is the **higher** of the customer level and the branch count level; its buffer is used in the LT.
- History and CSV export now include branch count and branch level.
- Older saved/exported master data without branch levels gets the default branch levels automatically.
- Bumped the service-worker cache to `mfg-lt-v2-5`.

## V2.6 update — BOM Analyzer integration prep
- Moved the master-data defaults and the lead-time formula into **`lt-core.js`** (no UI code), so the calculator and a future BOM analyzer / drawing-recognition tool share one formula. Results are unchanged (checked against 504 input combinations).
- **Input contract** `manufacturing-lt/input@1` (see the About tab for the full example and a downloadable sample):
  `customer`, `wireCount` (= CCT count), `branchCount`, `qty`, `startDate`, `specials`, plus optional `source` (`tool`, `drawingNo`, `revision`, `detected`, `bom`).
- **Load from BOM / Drawing JSON** button on the Calculator tab, and pre-fill by link, e.g.
  `index.html?wireCount=180&branchCount=25&customer=KOBELCO&qty=20&specials=Marker,Braiding&drawingNo=WH-12345`.
  Values are filled in only; a person checks them and presses Calculate. Unknown customers or special treatments are shown as warnings.
- Pre-filled fields are tagged **auto**, and change to **edited** when someone corrects them. History and CSV record the drawing number and input source (manual / auto / edited fields).
- BOM part lead times are shown (longest part LT) but **not yet added** to the LT — the rule for combining material and manufacturing LT is still to be decided.
- Fixed: the default start date and the ETD saved in History could be one day early in time zones ahead of UTC (e.g. Japan, Indonesia).
- Editing Master Data no longer clears the selected customer and special treatments on the Calculator tab.
- Bumped the service-worker cache to `mfg-lt-v2-6` and added `lt-core.js` to the offline cache.

Using the formula from another app:
```js
// <script src="lt-core.js"></script>  or  const LTCore = require("./lt-core.js")
const master = LTCore.normalizeMaster(LTCore.clone(LTCore.DEFAULT_MASTER));
const { inputs, warnings } = LTCore.parseInput(payload, master);
const result = LTCore.calcLeadTime(inputs, master); // { status: "ok" | "review" | "error", totalLT, etd, ... }
```
- Kept one **Set Current Data as Default** implementation (status line + Restore Factory Default). A default saved with the earlier ★ version (`mfg_ltc_user_default_master`) is migrated automatically on first load.

## V2.7 update — Production capacity check (ASSY FINDER link)
- New **WP Type** input (P / E / - / /, or Any) on the Calculator tab.
- **Master Data → Production Capacity**: paste the ASSY FINDER web app link (`…/exec`) and press **Save & Test**. Saved in this browser only.
- After a calculation, the result card shows a **Capacity-based ETD**: the first weekly ETD on or after the formula ETD whose free capacity fits the order (CCT × Qty).
  - Capacity per ETD = ASSY FINDER's average weekly CCT × QTY reaching FG for that WP type (last 12 weeks; "Any" = total capacity).
  - Booked = CCT × QTY of unfinished items already on that ETD (ETDs in the same week share one week's capacity). Unfinished items with a past ETD are booked in the current week.
  - An order bigger than one week's capacity is flagged with the number of weeks it needs.
- The feed (`?api=capacity`, schema `assy-finder/capacity@1`) has only totals per WP type and ETD — no item or customer details. JSON is tried first, then JSONP.
- History and CSV export now include WP Type, Capacity ETD and Capacity Note.
- `LTCore.planCapacity(feed, { load, wpType, earliest })` is available for other tools.
- The service worker no longer caches requests to other sites (the capacity feed is always fetched live). Cache bumped to `mfg-lt-v2-7`.

## V2.8 update — Median weekly capacity
- The capacity check now plans with the **median** weekly capacity (a normal week) instead of the average, so batch or catch-up weeks in the FG data no longer inflate it. A WP type made in fewer than half of the weeks still uses the average (its median would be 0).
- The feed sends `capacity[type] = { value, stat, median, average }`; the calculator uses `value` and shows which statistic it is. Older feeds that send only `average` still work.
- Cache bumped to `mfg-lt-v2-8`.

## V2.9 update — PROTO CONTROL naming
- The tools now form one suite, **PROTO CONTROL**: Analyzer (BOM / drawing analyzer) → **Planner** (this calculator) → **Tracker** (formerly ASSY FINDER) → Insight (performance & capacity pages in the Tracker).
- This app is renamed **PROTO CONTROL · Planner** (title, header, PWA name). "ASSY FINDER link" is now **Tracker link**.
- Nothing else changes: saved master data, history and the saved Tracker link stay in place, and the feed id `assy-finder/capacity@1` is kept so existing links keep working.
- Cache bumped to `mfg-lt-v2-9`.

## V3.0 update — Load results from the PROTO CONTROL Analyzer
- The Analyzer is the desktop **Harness BOM Analyzer** (reads the drawing, company parts DB, factory WOS). Its **Quick check** already opens this calculator with a pre-filled link.
- New: **Load BOM Analyzer result / JSON** also takes a finished analysis as a file: `work/<drawing>/result.json` or the exported `<drawing>_BOM.xlsx` (for when the result is on another PC or came by mail).
  - CCT = **process CCT** (factory QTY CCT), else cut wire pieces, else the count printed on the drawing (with a warning: not the factory count).
  - Branch count = **branch segments** (as `calculator_branch_count` in the Analyzer's `quick_customers.json`), else branch points.
  - Customer from the title-block company, else the drawing-number prefix; special treatments from keywords in the drawing notes and BOM lines — the same hints as `quick_customers.json` (`LTCore.ANALYZER_HINTS`).
- The source box shows **how** each value was found (CCT / branch count source, customer, the note that ticked each special treatment). Links can carry this as `cctSource` / `branchSource`.
- Converters are in `lt-core.js`: `LTCore.fromAnalyzerResult(result)` and `LTCore.analyzerWorkbookToResult(sheets)`.
- Excel files are read with SheetJS Community Edition 0.18.5 (`vendor/xlsx.full.min.js`, Apache-2.0, see `vendor/SHEETJS-LICENSE`), loaded only when an .xlsx is chosen.
