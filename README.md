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
