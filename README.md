# Groceries

A small phone-friendly web app for planning the weekly Harris Teeter order.

- **List**: this week's list, grouped by aisle. Type "we're out of…" items into the box at the top (separate several with commas). Tap 🔍 to search for an item on harristeeter.com, check it off once it's in your cart, and use 🏷️ to change its aisle (the app remembers your choice).
- **Usual items**: the chips under the add box are things you've added before. Tap one to add it again.
- **Staples**: things you buy every week. They're added back to the list each time you start a new week.
- **Meals**: save meals with their ingredients. Tap **+ Add** to put a meal's ingredients on this week's list, and tap it again to take them off.
- **Start new week**: clears checked items, resets meal picks, and adds staples back. Unchecked one-off items carry over so they don't get forgotten.
- **Quick-add link**: opening `…/?add=milk,eggs` adds those items, which is handy with an iPhone Shortcut.

## Run it

It's plain HTML/CSS/JS with no build step. Any static host works (for example, GitHub Pages). To run it locally:

    python3 -m http.server 8000

## Backups

Data lives in the browser's storage on each device, plus:

- **Google Drive (automatic):** once connected under **More**, every change is saved to `groceries-backup.json` in your Google Drive. Connect the same Google account on a new phone to restore. Google sign-in lasts about an hour; after that, a banner on the List tab asks for one tap to sign in again and finish the backup.
- **iCloud / file (manual):** **More → Save backup** opens the iPhone share sheet. Choose "Save to Files" → iCloud Drive. **Restore from file** loads it back.

### Setting up Google Drive backup (one time)

1. Go to https://console.cloud.google.com and create a project (e.g. "Groceries").
2. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**.
3. **Google Auth Platform** (called "OAuth consent screen" in older versions of the console): click **Get started**. Enter the app name and your email, choose **External**, and finish.
4. **Audience**: add the Gmail address of each family member who will use the app as a **test user**.
5. **Data Access → Add or remove scopes**: add `https://www.googleapis.com/auth/drive.file` and save.
6. **Clients → Create client**: choose **Web application**. Under **Authorized JavaScript origins**, add `https://dreadcaptjames.github.io`, then create it.
7. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into `config.js`. It isn't a secret.
