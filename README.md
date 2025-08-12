# Canadian Trail — Phase 1 (Bootstrap)

Static, vanilla HTML/CSS/JavaScript (ES Modules). No frameworks, no bundlers, no npm packages.

## Quick Start (Local Preview)

You only need Python (preinstalled on macOS and many Windows setups). This serves the folder at <http://localhost:5173>.

### Option A — Python (recommended)
```bash
# From the project folder:
python3 -m http.server 5173 || python -m http.server 5173
Then open your browser to: http://localhost:5173

If both python3 and python fail, install Python from https://www.python.org/downloads/

Option B — Node http-server (if you already have Node)
bash
Copy
npx http-server -p 5173
Development Scripts
package.json includes:

dev: runs Python’s simple HTTP server on port 5173

test: runs a tiny Node smoke test

bash
Copy
npm run dev
npm test
Project Structure (Phase 1)
bash
Copy
index.html
styles.css
main.js
/data/*.json
/systems/*.js
/state/*.js
/ui/*.js
/tests/run.js
Notes
JSON is always loaded via fetch(new URL(path, import.meta.url)) inside systems/jsonLoader.js.

Assets are declared in data/manifest.json. If a referenced file is missing, a crisp placeholder is auto-generated so the UI still looks good now and art can be dropped in later without code changes.

A seeded RNG is stored in saves; all randomness will flow from it in later phases.

Hosting on GitHub Pages
Push this repo to GitHub.

Go to Settings → Pages.

Under Build and deployment, set Source to Deploy from a branch.

Set Branch to main (or master) and / (root).

Click Save. After a minute, your site will be live on https://<your-username>.github.io/<repo-name>/.

This project uses only relative paths resolved from modules, so it works fine on GitHub Pages subpaths.

pgsql
Copy
