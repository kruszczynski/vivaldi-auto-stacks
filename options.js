const DEFAULTS = {
  autoDomain: true,
  minTabsForDomain: 2,
  apiKey: "",
  model: "claude-haiku-4-5",
  aiInstructions: ""
};

const $ = (id) => document.getElementById(id);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  $("autoDomain").checked = s.autoDomain;
  $("minTabsForDomain").value = s.minTabsForDomain;
  $("apiKey").value = s.apiKey;
  $("model").value = s.model;
  $("aiInstructions").value = s.aiInstructions;
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    autoDomain: $("autoDomain").checked,
    minTabsForDomain: Math.max(2, parseInt($("minTabsForDomain").value, 10) || 2),
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim() || DEFAULTS.model,
    aiInstructions: $("aiInstructions").value.trim()
  });
  $("status").textContent = "Saved";
  setTimeout(() => ($("status").textContent = ""), 1500);
});

load();
