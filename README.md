# Auto Stacks (Vivaldi)

Stacks tabs automatically by domain, and regroups a window by topic with Claude on demand.
Needs a recent Vivaldi (one that maps the Chrome tab groups API to tab stacks).

## Install
1. Open `vivaldi://extensions`, turn on **Developer mode**.
2. **Load unpacked** and pick this folder.
3. Right-click the extension icon > **Options**: paste an Anthropic API key (only needed for AI regroup).

## Use
- **Automatic:** when 2+ loose tabs share a domain, they get stacked. New tabs on that domain join the stack.
- **AI regroup:** click the toolbar icon or press `Alt+Shift+G`. Ungroups the window and restacks it by topic.
- **Restack by domain:** `Alt+Shift+D`, or right-click the icon.
- Change shortcuts at `vivaldi://extensions/shortcuts`.

Pinned tabs are never touched. Stacks you make by hand, and AI stacks, are left alone by the domain rule.
A red `!` badge means the AI call failed (check the service worker console in `vivaldi://extensions`).
