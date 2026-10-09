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
- Added **Set Current Data as Default** in Master Data.
- Saves a browser-local copy of the current Master Data for reuse.
- Reset Master Data restores the saved default when present.
