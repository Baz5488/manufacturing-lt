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

## V3.1 update — Rocket special treatment
- **Rocket** (−14 days) is a default special treatment. Rocket is a business decision and is not shown on drawings, so it is never ticked automatically: tick it by hand, or send `specials=Rocket` in a link.
- Master data already saved in a browser gets Rocket added once, on the first load of v3.1. Your own changes are kept, and Rocket is not added back if you later rename or change it.
- Special-treatment days can be negative; they are shown as "−14 days".
- Like the other buffers, Rocket's −14 days is added before the quantity factor is applied.

## V3.2 update — Rocket ETD: must achieve, earlier when capacity allows
- **Rocket** is a must-achieve short-lead-time service. The formula ETD with Rocket's −14 days is the **Rocket ETD**: the latest allowed date. It is labelled *🚀 Rocket ETD — must achieve*.
- With the Tracker capacity link, the Planner searches every week from the **earliest possible date** to the Rocket ETD, and suggests the earliest ETD with enough free capacity.
  - The earliest possible date is start + drawing breakdown days for the CCT range + one production week.
  - Normal orders still search *later* than the formula ETD.
- If no week up to the Rocket ETD has room, the Rocket ETD is **kept** with a red warning showing how much capacity is short. If the order alone is bigger than one week's capacity, the warning says to split it instead.
- History records the result in the capacity columns, e.g. "Rocket: 27 days early" or "Rocket: short 200 CCT".
- **Rocket's days come off after the quantity factor, scaled by (2 − factor), never below 0**: a bigger lot is harder to rush.
  - The savings by quantity factor are: 1 pc −14 days, ×1.1 −13, ×1.2 −11, ×1.3 −10, ×1.5 −7.
  - With a factor of 2.0 or more, Rocket saves nothing.
  - This applies to any special treatment with negative days. The *Short-LT reduction* row in the result shows it, e.g. "−7 days (14 × 0.50)".
  - It replaces the v3.1 behaviour, where the −14 was multiplied by the factor.
- Core: `LTCore.calcLeadTime()` returns `rocket: { deadline, floor }`; `LTCore.planRocket(feed, { load, wpType, floor, deadline })`.

## V3.3 update — Backlog carried forward in the capacity check
- Load a week cannot finish is now **carried into the following weeks**. This covers overdue items (backlog, booked in the current week) and weeks booked above capacity. The capacity tables show "incl. N carried in" under Booked CCT.
- Before v3.3, backlog stayed in the current week, and overload beyond one week's capacity was dropped. Later weeks therefore looked freer than they were.
- Needs the updated Tracker (`Code.gs`) or `CapacityFeed.gs`. Both now send **every ETD up to 26 weeks ahead**, not only the next 10. Before, weeks after the 10th ETD date showed 0 booked.
- Items without a date in column J (NO ETD) are still left out.

## V3.4 update — New versions show up on the next visit
- Before v3.4, a browser could keep showing the previous version for up to 10 minutes after a deploy. GitHub Pages lets browsers reuse a page for that long, and the offline cache accepted that copy. This is why Edge and Chrome could show different versions.
- The page is now always checked with GitHub Pages (a small "has it changed?" request), and a new version appears on the next visit.
  - The service worker itself is also checked on every visit.
  - Its offline files are fetched fresh when it installs.
- Offline use is unchanged: without a network the last saved version opens.
- Browsers still on v3.3 need one hard reload (Ctrl+Shift+R), or a wait of about 10 minutes, to get v3.4. After that, updates come through by themselves.

## V3.5 update — Combined WP type P + E
- New **WP Type** choice **P + E (main teams)**. The capacity check plans with both teams together.
  - Capacity is the sum of their weekly capacities.
  - Booked load is both teams' load per ETD, and backlog is carried forward as one.
  - Use it when an order can be split between team P and team E. An order too big for one team often fits both.
- In `lt-core.js`, `wpType` accepts types joined with "+" (e.g. `"P+E"`), so other combinations can be added later.
- The combined capacity adds each team's typical (median) week. When one team uses the average (it builds in fewer than half of the weeks), the stat is shown per team, e.g. "P median, E average".

## V3.6 update — Rocket: find ASSYs to exchange
- When a Rocket order is short of capacity, the Rocket box shows **🔁 FIND ASSYs TO EXCHANGE**. It opens the Tracker's CAPACITY page (sign-in needed) with a **ROCKET EXCHANGE** card.
- The card lists unfinished, non-Rocket ASSYs that meet all of these, most spare days first:
  - their ETD is on or before the Rocket ETD;
  - they are the same WP type(s);
  - their customer due date is at least 7 days after the Rocket ETD, so they can take a later ETD and still be on time.

  It marks the set that frees enough CCT, or says when even all of them are not enough.
- **Master Data → Production Capacity → Tracker page link**: the Tracker you open in the browser. It can be left empty when the capacity link is the Tracker itself.
- Only the Rocket ETD, the CCT short, the WP type and the order's CCT are put in the link. ASSY numbers and customers stay in the Tracker; the public capacity feed still has totals only.
- WP type "-" (e.g. 01-10) is no longer a choice. It is made too rarely (a few CCT a week) to plan with; its load still counts in "Any (total capacity)".

## V3.7 update — Backward planning from a required ETD
- New **Plan From** choice: *Start date → ETD* (as before) or **Required ETD → latest start date**. Use it when the ETD is fixed because it must meet the customer due date.
- The result shows the **latest manufacturing start date** (required ETD − total LT). If that date has passed, it shows in red with the ETD you get when starting today.
- The capacity check searches the ETD weeks from the earliest possible ETD (today + LT) up to the required ETD and picks the **latest week with room**, so production starts as late as possible. Each week shows its own *Start by* date.
- If no week has room, it shows the CCT short and **FIND ASSYs TO EXCHANGE**, with the required ETD as the deadline. If even starting today is too late, it says how many days and suggests shortening the LT or agreeing a new ETD.
- History records the plan mode (`plan: forward | backward`).
- Core: `LTCore.planBackward(feed, { load, wpType, deadline, lt, today })`; `LTCore.addDays` is exported.

## V3.8 update — WP lines S and C
- WP Type now lists every line by name:
  - **P** prototype line
  - **E** pre-mass production line
  - **/** regular line
  - **S** small volume line (new, e.g. 03S08)
  - **C** Caterpillar line (new, e.g. 10C08)
  - **P + E**
- The Tracker / capacity feed must send S and C capacity: update the Tracker `Code.gs` (or `CapacityFeed.gs`).

## V3.9 update — Production / Quotation booking
- New ticks under the inputs: **Production** (book the CCT on its ETD week) or **Quotation** (record only), with the **ASSY No.** (or a quotation reference).
- After the capacity check the result is sent to the Tracker (`PLANNER_BOOKINGS` tab):
  - **Production**: the CCT × Qty is added to the Tracker capacity on the planned ETD (capacity-based ETD, else the formula ETD), so the same room is not promised twice. It stops counting when the ASSY gets a new row in PRIORITES BARU (the real order is counted there), when the ETD passes, or when it is cancelled in the Tracker.
  - **Quotation**: recorded only. It can be confirmed as production in the Tracker (CAPACITY → PLANNER BOOKINGS) when the order comes.
  - Re-planning the same ASSY replaces its booking, and its own booked load is left out of the check.
- Booking needs the Tracker owner key: Master Data → Production Capacity → **Booking key** (paste the link from `createOwnerLink`). Without it the Planner still calculates.
- P + E bookings count half on P and half on E; "Any" counts in the total only.
- Needs the Tracker `Code.gs` with `doPost` (Planner bookings).

## V3.10 update — backward plan when the required ETD cannot be met
- When even starting today misses the required ETD, the backward plan now searches forward from today instead of stopping:
  - It shows the earliest ETD with free capacity and how many days after the required ETD that is.
  - The capacity table lists the weeks from the earliest possible ETD.
  - When the first possible ETD week is full, **FIND ASSYs TO EXCHANGE** opens the Tracker with the ASSYs that could move later to bring the order back to that week.
- With Production / Quotation ticked, that earliest free ETD is the one booked.
- Tracker link: a `/dev` test link is refused with an explanation (it only works inside the Apps Script editor). An owner link (`…/exec?key=…`) pasted there is split: the key is saved as the booking key and the plain `/exec` link is stored.

## V3.11 update — 3D special treatment
- **3D** (+5 days) is a default special treatment: the harness must be shaped as drawn — arrow views (矢視), section views (K-K) or *HARNESS FORMING* / *DIRECTION OF HARNESS* figures with bend angles and branch directions.
- Master data already saved in a browser gets 3D added once, on the first load of v3.11 (like Rocket in v3.1).
- **The Analyzer decides**: its result files now carry `lt_specials` (each with the evidence text), found in the notes, BOM lines and the text printed anywhere on the sheet. *Load BOM Analyzer result* uses them first; the keyword hints only fill in for older result files.
- Links can send it as `specials=3D`.

## V3.12 update — repeat order
- New tick **Repeat order**: the drawing is already broken down, so the drawing breakdown LT is 0 days (the result shows the days it saves).
- Applies everywhere the drawing LT is used: total LT, ETD, backward start date, and the Rocket earliest ETD (start + 1 production week).
- History shows "Repeat order" under Special. Input JSON / URL accept `repeat` (`true`, `1`, `yes`).
- Core: `calcLeadTime(inputs)` takes `inputs.repeat`; the result has `repeat` and `drawingDays` (the drawing days actually used).

## V3.13 update — Analyzer special treatments only; braiding = woven braid
- A BOM Analyzer result that carries `lt_specials` is used **as it is**: the calculator no longer adds treatments from its own keyword hints on top. The hints are only for older result files without `lt_specials`.
- **Braiding** means woven braid made in the factory from braiding yarn — *woven braid*, *ウーブン*, *yarn*, Caterpillar *BRAID-YL* (mostly Caterpillar and Komatsu harnesses). Twist tube and other sleeves (e.g. Federal-Mogul TwistTube) are **not** braiding.

## V3.14 update — 未完製品入荷フロー dashboard
- New page **`incomplete.html`** (link in the Planner header): tracks each incomplete harness (未完製品) from arrival to work completion, following the 未完製品入荷情報 flow.
- Steps and owners: ハーネス品番情報 (確認印 from 生産管理・営業・技術部門・調達・品証・物流) → 理由 (調達/技術部門/営業) → ハーネスの状態確認 (生産管理) → 作業内容確認 / 国内作業可否 (技術部門)
  - **可** → 作業部署の決定 (営業・技術部門・調達・品証 確認印) and BEIへ未完連絡 (生産管理), then 国内部品確認 (調達), 作業着手 / 作業完了 (作業担当)
  - **否** → 納期調整 (営業); the 可-only steps show as 対象外
  - 入荷情報 (インボイス番号 / 数量 / ETA, 生産管理) → 内容確認 (確認印 from all six departments)
- Dashboard: open / my-department / overdue / completed KPIs, per-department "対応待ち" counts and filter, progress bar, current step and waiting departments for each case, 納期超過 and ETA超過 flags.
- Choose **自分の部署** and **担当者名** at the top: stamps and reports record who and when, and every action goes to the case history. Changing 品番情報 or 入荷情報 resets the stamps that confirmed it.
- Data is stored in this browser (localStorage). Share with **JSON 出力 / JSON 読込** (merge by case, newer history wins); **CSV 出力** for Excel.
- Service worker: cache `mfg-lt-v3-14`; a page is now cached under its own URL (before, every page was cached as `index.html`).
