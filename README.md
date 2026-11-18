# Auto Stacks (Vivaldi)

Stacks GitHub pull requests and projects automatically, and regroups a window by topic with Claude on demand.
Needs a recent Vivaldi (one that maps the Chrome tab groups API to tab stacks).

## Install
1. Open `vivaldi://extensions`, turn on **Developer mode**.
2. **Load unpacked** and pick this folder.
3. Right-click the extension icon > **Options**: paste an Anthropic API key (only needed for AI regroup).

## Use
- **Automatic:** only specific pages are stacked, not whole domains:
  - GitHub pull requests (`/owner/repo/pull/N`, PR lists, `github.com/pulls`) go into a **PRs** stack.
  - GitHub projects (`/orgs/x/projects/N`, `/users/x/projects/N`, repo projects) go into a separate **Projects** stack.
  
  New tabs (the start page / speed dials) are always pulled out of any stack, so opening one from inside a stack leaves it loose until you navigate somewhere.

  A stack is created once 2+ loose tabs match; new matching tabs join it. Rules live in `RULES` in `background.js`.
- **AI regroup:** click the toolbar icon or press `Alt+Shift+G`. Ungroups the window and restacks it by topic.
- **Restack by domain:** `Alt+Shift+D`, or right-click the icon. PRs and projects still get their own stacks; every other domain with 2+ tabs is stacked by domain.
- Change shortcuts at `vivaldi://extensions/shortcuts`.

Pinned tabs are never touched. Stacks you make by hand, and AI stacks, are left alone by the automatic rules.
A red `!` badge means the AI call failed (check the service worker console in `vivaldi://extensions`).

## Optional: active tab color in stacks
Vivaldi draws the active tab in a colored stack in the theme's grey. `vivaldi-css/active-stack-tab.css` gives it a darker shade of the stack color instead. To use it:
1. Open `vivaldi://experiments` and turn on **Allow for using CSS modifications**, then restart Vivaldi.
2. Settings > Appearance > **Custom UI Modifications**: pick this repo's `vivaldi-css` folder.
3. Restart Vivaldi.
