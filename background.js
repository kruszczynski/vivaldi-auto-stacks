// Auto Stacks: rule-based auto-stacking + on-demand AI regrouping.
// Uses the Chrome tabGroups API, which Vivaldi renders as tab stacks.

const DEFAULTS = {
  autoDomain: true,
  minTabsForDomain: 2,
  apiKey: "",
  model: "claude-haiku-4-5",
  aiInstructions: ""
};

const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
const NONE = chrome.tabGroups.TAB_GROUP_ID_NONE;

// ---------- helpers ----------

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

// Registry of groups this extension created:
// { [groupId]: {kind:"auto", key} | {kind:"ai"} }
// key is a rule key (e.g. "github-prs") or "host:<hostname>" for a manual restack by domain.
async function getRegistry() {
  const { registry = {} } = await chrome.storage.session.get("registry");
  return registry;
}
async function setRegistry(registry) {
  await chrome.storage.session.set({ registry });
}

function parseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  return parseUrl(url)?.hostname.replace(/^www\./, "") ?? null;
}

function colorFor(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

// Serialize all tab/group mutations so events don't race each other.
let queue = Promise.resolve();
function enqueue(fn) {
  queue = queue.then(fn).catch((e) => console.error("[Auto Stacks]", e));
  return queue;
}

async function setBadge(text, color = "#555") {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

// ---------- stack rules ----------

// Only URLs matching a rule are stacked automatically. First match wins.
const RULES = [
  {
    key: "github-prs",
    title: "PRs",
    color: "purple",
    // /owner/repo/pull/123[/files...], /owner/repo/pulls, /pulls
    match: (u) => u.hostname === "github.com" && /^(\/[^/]+\/[^/]+)?\/pulls?(\/|$)/.test(u.pathname)
  },
  {
    key: "github-projects",
    title: "Projects",
    color: "green",
    // /orgs/x/projects/1, /users/x/projects/1, /owner/repo/projects
    match: (u) => u.hostname === "github.com" && /^\/[^/]+\/[^/]+\/projects(\/|$)/.test(u.pathname)
  }
];

function ruleFor(url) {
  const u = parseUrl(url);
  return (u && RULES.find((r) => r.match(u))) || null;
}

// ---------- automatic stacking ----------

async function placeTab(tabId) {
  const s = await getSettings();
  if (!s.autoDomain) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // tab closed
  }
  if (tab.pinned) return;

  const url = tab.url || tab.pendingUrl;
  const rule = ruleFor(url);
  const host = hostOf(url);
  const hostKey = host && `host:${host}`;

  const reg = await getRegistry();

  // Leave tabs alone if they're in an AI stack or a stack you made by hand.
  if (tab.groupId !== NONE) {
    const info = reg[tab.groupId];
    if (info?.kind !== "auto") return;
    if (info.key === rule?.key || info.key === hostKey) return; // already in the right stack
  }

  // Join an existing stack in this window: the rule's stack first, else a manual restack-by-domain stack.
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  const stackWithKey = (key) =>
    key ? groups.find((g) => reg[g.id]?.kind === "auto" && reg[g.id].key === key) : undefined;
  const existing = stackWithKey(rule?.key) || stackWithKey(hostKey);
  if (existing) {
    await chrome.tabs.group({ groupId: existing.id, tabIds: [tab.id] });
    return;
  }

  // Otherwise create the rule's stack if enough loose tabs match it.
  if (rule) {
    const all = await chrome.tabs.query({ windowId: tab.windowId, pinned: false });
    const siblings = all.filter(
      (t) => t.id !== tab.id && t.groupId === NONE && ruleFor(t.url || t.pendingUrl)?.key === rule.key
    );
    if (siblings.length + 1 >= s.minTabsForDomain) {
      const gid = await chrome.tabs.group({ tabIds: [tab.id, ...siblings.map((t) => t.id)] });
      await chrome.tabGroups.update(gid, { title: rule.title, color: rule.color });
      reg[gid] = { kind: "auto", key: rule.key };
      await setRegistry(reg);
      return;
    }
  }

  // Navigated away from its auto stack and nothing to join: pull it out.
  if (tab.groupId !== NONE) await chrome.tabs.ungroup(tab.id);
}

// Manual restack: rule stacks where a rule matches, otherwise one stack per domain.
async function regroupAllByDomain(windowId) {
  const s = await getSettings();
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  if (!tabs.length) return;

  await chrome.tabs.ungroup(tabs.map((t) => t.id));

  const byKey = new Map();
  for (const t of tabs) {
    const url = t.url || t.pendingUrl;
    const rule = ruleFor(url);
    const host = hostOf(url);
    const stack = rule
      ? { key: rule.key, title: rule.title, color: rule.color }
      : host && { key: `host:${host}`, title: host, color: colorFor(host) };
    if (!stack) continue;
    if (!byKey.has(stack.key)) byKey.set(stack.key, { ...stack, ids: [] });
    byKey.get(stack.key).ids.push(t.id);
  }

  const reg = await getRegistry();
  for (const { key, title, color, ids } of byKey.values()) {
    if (ids.length < Math.max(2, s.minTabsForDomain)) continue;
    const gid = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(gid, { title, color });
    reg[gid] = { kind: "auto", key };
  }
  await setRegistry(reg);
}

// ---------- AI regrouping ----------

const SYSTEM_PROMPT = `You organise a user's open browser tabs into tab stacks by topic, project or task, the way a smart browser would.
You get a JSON array of tabs: {"i": index, "title": ..., "url": ...}.
Return ONLY a JSON object, no prose, no code fences:
{"groups":[{"name":"short label, max 3 words","color":"one of grey|blue|red|yellow|green|pink|purple|cyan|orange","tabs":[indices]}]}
Rules:
- Group by what the user is working on, not by website. Tabs from different sites about the same project belong together.
- Each tab index appears in at most one group. Every group has at least 2 tabs.
- Tabs that don't clearly belong anywhere are left out (they stay unstacked).
- Prefer roughly 3 to 8 groups. Use distinct colors where possible.`;

function shortUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).slice(0, 120);
  } catch {
    return (url || "").slice(0, 120);
  }
}

function parsePlan(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model returned no JSON");
  const plan = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(plan.groups)) throw new Error("Model JSON has no groups array");
  return plan;
}

async function askClaude(settings, tabList) {
  const system = settings.aiInstructions
    ? `${SYSTEM_PROMPT}\nExtra preferences from the user:\n${settings.aiInstructions}`
    : SYSTEM_PROMPT;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: JSON.stringify(tabList) }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return parsePlan(text);
}

async function aiRegroup(windowId) {
  const s = await getSettings();
  if (!s.apiKey) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  if (tabs.length < 2) return;

  await setBadge("...");
  try {
    const list = tabs.map((t, i) => ({ i, title: (t.title || "").slice(0, 150), url: shortUrl(t.url || t.pendingUrl) }));
    const plan = await askClaude(s, list);

    // Make sure tabs still exist after the (slow) API call.
    const alive = new Set((await chrome.tabs.query({ windowId })).map((t) => t.id));
    await chrome.tabs.ungroup(tabs.filter((t) => alive.has(t.id)).map((t) => t.id));

    const used = new Set();
    const reg = await getRegistry();
    for (const g of plan.groups) {
      const ids = [];
      for (const idx of g.tabs || []) {
        const t = tabs[idx];
        if (!t || used.has(idx) || !alive.has(t.id)) continue;
        used.add(idx);
        ids.push(t.id);
      }
      if (ids.length < 2) continue;
      const name = String(g.name || "Stack").slice(0, 40);
      const gid = await chrome.tabs.group({ tabIds: ids });
      await chrome.tabGroups.update(gid, {
        title: name,
        color: COLORS.includes(g.color) ? g.color : colorFor(name)
      });
      reg[gid] = { kind: "ai" };
    }
    await setRegistry(reg);
    await setBadge("");
  } catch (e) {
    console.error("[Auto Stacks] AI regroup failed:", e);
    await setBadge("!", "#c0392b");
    setTimeout(() => setBadge(""), 5000);
  }
}

// ---------- wiring ----------

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) enqueue(() => placeTab(tabId));
});

chrome.tabGroups.onRemoved.addListener((group) => {
  enqueue(async () => {
    const reg = await getRegistry();
    if (reg[group.id]) {
      delete reg[group.id];
      await setRegistry(reg);
    }
  });
});

chrome.action.onClicked.addListener((tab) => enqueue(() => aiRegroup(tab.windowId)));

chrome.commands.onCommand.addListener(async (command) => {
  const win = await chrome.windows.getLastFocused();
  if (command === "ai-regroup") enqueue(() => aiRegroup(win.id));
  if (command === "domain-regroup") enqueue(() => regroupAllByDomain(win.id));
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "ai-regroup", title: "AI regroup this window", contexts: ["action"] });
  chrome.contextMenus.create({ id: "domain-regroup", title: "Restack this window by domain", contexts: ["action"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === "ai-regroup") enqueue(() => aiRegroup(tab.windowId));
  if (info.menuItemId === "domain-regroup") enqueue(() => regroupAllByDomain(tab.windowId));
});
