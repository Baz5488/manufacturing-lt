# Manufacturing Lead Time Calculator v2

Static PWA for GitHub Pages.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `manufacturing-lt`.
2. Upload these files to the repository root:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon.svg`
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
- Added **Set Current Data as Default** in Master Data.
- Saves a browser-local copy of the current Master Data for reuse.
- Reset Master Data restores the saved default when present.
