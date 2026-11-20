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

Data is stored in the browser's localStorage on each device. Use **More → Export/Import backup** to move it between devices.
