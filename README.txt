# The Pint Register

A small local-first Dublin pub and Guinness tracker.

## Run it
For best results, open this folder with a simple local web server (for example VS Code Live Server). The app loads `pubs.csv` as its starter register, then saves edits in your browser's localStorage.

## Data and backups
- Use **Export CSV** regularly to back up your current register.
- Use **Import CSV** to restore an exported register.
- Browser storage is local to that browser/device. It does not automatically sync between devices.
- Prices are stored as dated entries, so old prices are retained.
- A venue contributes to **Unique places visited** only when its `Visited?` field is set to Yes. Repeated visits do not increase that count.
- The map starts with no pins rather than guessing venue coordinates. Add latitude and longitude in a venue's details to place an exact pin.

## Starter data
The first 20 Guinness scores reflect the ratings supplied so far. The remaining venues are awaiting ratings. Ambiguous venue locations are marked for confirmation.
