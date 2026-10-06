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


### V2.2 — Branch Count Difficulty
Branch Count is now an input to the calculator.

Default Branch Difficulty:
- 0–10 branches → Level 1
- 11–30 branches → Level 2
- 31–60 branches → Level 3
- >60 branches → Level 4

Final Difficulty Level = the higher of Customer Difficulty Level and Branch Difficulty Level.

Branch rules are editable under Master Data.
