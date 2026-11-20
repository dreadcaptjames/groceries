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

## Google Sheet (backup + shared family list)

The app syncs with a Google Sheet in your own Google account. Every phone connected to the same sheet shares one list. Changes sync a couple of seconds after you make them, plus every 30 seconds while the app is open and whenever you switch back to it. Without signal, changes are saved on the phone and sync later. Google Sheets' version history (File → Version history) gives you a backup of every change.

You can also edit the sheet directly. Add a row to **List** (just type a name), tick the **inCart** checkbox, or delete a row, and the app picks it up on its next sync. The **Aisles**, **History**, **Settings** and **Deleted** tabs are hidden helpers that the app uses.

### Setup (once, about 5 minutes)

1. Create a new Google Sheet, e.g. "Groceries".
2. In the sheet, open **Extensions → Apps Script**. Delete what's there, paste in the contents of [`apps-script/Code.gs`](apps-script/Code.gs), and click **Save**.
3. Click **Deploy → New deployment**. Click the gear icon next to "Select type" and choose **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Click **Deploy**, then **Authorize access** and pick your Google account. Google will warn that the app isn't verified, because it's your own script: click **Advanced → Go to … (unsafe)** → **Allow**.
4. Copy the **Web app URL** (it starts with `https://script.google.com/macros/s/` and ends in `/exec`).
5. On each phone, open the app and go to **More → Google Sheet**, paste the link, and tap **Connect**.

Treat that link like a key: anyone who has it can read and change the grocery list. Don't post it publicly (this repository is public, so the link isn't stored in it).

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the link stays the same.

## Extra backup to iCloud / a file

**More → Save backup** opens the iPhone share sheet. Choose "Save to Files" → iCloud Drive. **Restore from file** loads it back.
