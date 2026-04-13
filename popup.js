/*
  What this file does:
  Renders the consumer popup and sends user-initiated broken-site reports to support.

  Why it exists:
  Regular users need clear modes, one pause control, and a report flow that feels fast without exposing hidden telemetry.

  How to extend it:
  Keep the popup minimal. Add future support tooling behind deliberate user actions instead of extra top-level buttons.
*/

const modeSelect = document.getElementById("modeSelect");
const modeHelp = document.getElementById("modeHelp");
const modeInfoButton = document.getElementById("modeInfoButton");
const modePopover = document.getElementById("modePopover");
const hostnameText = document.getElementById("hostname");
const outcomeLabel = document.getElementById("outcomeLabel");
const activityLine = document.getElementById("activityLine");
const bannerLine = document.getElementById("bannerLine");
const toggleSiteButton = document.getElementById("toggleSite");
const saveBugReportButton = document.getElementById("saveBugReport");
const statsHidden = document.getElementById("statsHidden");
const statsRejected = document.getElementById("statsRejected");
const statsReports = document.getElementById("statsReports");
const statusText = document.getElementById("status");
const reportDisclosure = document.getElementById("reportDisclosure");
const reportDisclosureBackdrop = document.getElementById("reportDisclosureBackdrop");
const reportDisclosureText = document.getElementById("reportDisclosureText");
const reportConsentCheckbox = document.getElementById("reportConsentCheckbox");
const cancelReportDisclosureButton = document.getElementById("cancelReportDisclosure");
const confirmReportDisclosureButton = document.getElementById("confirmReportDisclosure");

const popupState = {
  currentStatus: null,
  reportBusy: false
};

const REPORT_SUCCESS_STATES = new Set(["submitted", "duplicate"]);
const REPORT_RECENT_WINDOW_MS = 30000;

const modeDescriptions = {
  balanced: "Calmer banner handling for everyday browsing.",
  visual_only: "Never clicks buttons. Only hides banners visually.",
  strict_reject: "Uses the most aggressive reject attempts when confidence is high."
};

document.addEventListener("DOMContentLoaded", initialize);
document.addEventListener("click", handleDocumentClick);
modeSelect.addEventListener("change", handleModeChange);
modeInfoButton.addEventListener("click", toggleModePopover);
toggleSiteButton.addEventListener("click", toggleSite);
saveBugReportButton.addEventListener("click", handleReportClick);
reportDisclosureBackdrop.addEventListener("click", closeReportDisclosure);
cancelReportDisclosureButton.addEventListener("click", closeReportDisclosure);
reportConsentCheckbox.addEventListener("change", syncDisclosureControls);
confirmReportDisclosureButton.addEventListener("click", confirmReportDisclosure);

async function initialize() {
  reportDisclosureText.textContent = CookielessConfig.reportSubmission.disclosureText;
  await refresh();
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({
    type: "getStatus"
  });

  if (!response?.ok) {
    popupState.currentStatus = null;
    setStatus("Cookieless could not read the current tab.");
    return;
  }

  popupState.currentStatus = response;
  modeSelect.value = response.mode;
  modeHelp.textContent = modeDescriptions[response.mode] || "";
  hostnameText.textContent = formatHostname(response.hostname);

  const visualOutcome = formatOutcomeLabel(response.outcome?.label, response.siteEnabled);
  const outcomeColors = outcomeColor(visualOutcome);
  outcomeLabel.textContent = visualOutcome;
  outcomeLabel.style.background = outcomeColors.background;
  outcomeLabel.style.color = outcomeColors.color;

  activityLine.textContent = describeActivity(response);
  bannerLine.textContent = describeBanner(response);
  statsHidden.textContent = String(response.stats.hiddenCount || 0);
  statsRejected.textContent = String(response.stats.rejectedCount || 0);
  statsReports.textContent = String(response.stats.reportCount || 0);

  toggleSiteButton.textContent = response.siteEnabled ? "Pause on this site" : "Resume on this site";
  toggleSiteButton.disabled = !response.hostname;
  const reportDisabled =
    popupState.reportBusy ||
    !response.reportSubmissionEnabled ||
    !response.hostname ||
    !isNormalWebUrl(response.tabUrl);

  const lastReport = response.lastReportStatus || null;
  const sameHostname =
    Boolean(lastReport?.hostname) &&
    Boolean(response.hostname) &&
    String(lastReport.hostname).toLowerCase() === String(response.hostname).toLowerCase();
  const recentlyReported =
    sameHostname &&
    REPORT_SUCCESS_STATES.has(String(lastReport?.state || "")) &&
    Number(lastReport?.submittedAt || 0) > 0 &&
    Date.now() - Number(lastReport.submittedAt) < REPORT_RECENT_WINDOW_MS;

  saveBugReportButton.textContent = recentlyReported ? "Reported" : "Report broken site";
  saveBugReportButton.disabled = reportDisabled || recentlyReported;
}

async function handleModeChange() {
  const response = await chrome.runtime.sendMessage({
    type: "setMode",
    mode: modeSelect.value
  });

  if (!response?.ok) {
    setStatus("Mode change failed.");
    return;
  }

  setStatus(`Cookieless is now set to ${humanizeMode(modeSelect.value)}.`);
  await refresh();
}

function toggleModePopover(event) {
  event.stopPropagation();
  const isOpen = !modePopover.hidden;
  modePopover.hidden = isOpen;
  modeInfoButton.setAttribute("aria-expanded", String(!isOpen));
}

function handleDocumentClick(event) {
  if (
    modePopover.hidden ||
    modePopover.contains(event.target) ||
    modeInfoButton.contains(event.target)
  ) {
    return;
  }

  modePopover.hidden = true;
  modeInfoButton.setAttribute("aria-expanded", "false");
}

async function toggleSite() {
  const response = await chrome.runtime.sendMessage({
    type: "toggleSite"
  });

  if (!response?.ok) {
    setStatus(response?.error || "This site could not be updated.");
    return;
  }

  setStatus(response.message || "Cookieless updated this site.");
}

async function handleReportClick() {
  if (!popupState.currentStatus?.reportingConsentAcknowledged) {
    openReportDisclosure();
    return;
  }

  await submitBugReport();
}

function openReportDisclosure() {
  reportConsentCheckbox.checked = false;
  syncDisclosureControls();
  reportDisclosure.hidden = false;
}

function closeReportDisclosure() {
  reportDisclosure.hidden = true;
}

function syncDisclosureControls() {
  confirmReportDisclosureButton.disabled = !reportConsentCheckbox.checked;
}

async function confirmReportDisclosure() {
  if (!reportConsentCheckbox.checked) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "setReportConsentState",
    acknowledged: true
  });

  if (!response?.ok) {
    setStatus("Cookieless could not save your report preference.");
    return;
  }

  popupState.currentStatus = {
    ...(popupState.currentStatus || {}),
    reportingConsentAcknowledged: true
  };
  closeReportDisclosure();
  await submitBugReport();
}

async function submitBugReport() {
  popupState.reportBusy = true;
  saveBugReportButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "submitBugReport"
    });

    if (response?.requiresConsent) {
      openReportDisclosure();
      return;
    }

    if (!response?.ok) {
      setStatus(response?.error || "Cookieless could not send this report.");
      return;
    }

    setStatus(
      response.deduped
        ? "Reported. Cookieless matched a recent copy and refreshed the support signal."
        : "Reported. Thanks for flagging this site."
    );
  } finally {
    popupState.reportBusy = false;
    await refresh();
  }
}

function describeActivity(response) {
  if (!response?.hostname) {
    return "Open a normal website to see Cookieless on the current page.";
  }

  if (!response.siteEnabled) {
    return "Cookieless is paused here. Reloading leaves this site completely alone.";
  }

  switch (response.outcome?.label) {
    case "Rejected":
      return "Rejected a supported banner on this page.";
    case "Hidden only":
      return "Hid a banner without clicking it.";
    case "Blocked on load":
      return "Started protection as the page loaded.";
    case "Cleared site state":
      return "Site cookies and storage were cleared earlier.";
    case "Cookies blocked":
      return "Cookies are blocked on this site.";
    case "Session-only":
      return "Cookies are limited to this session on this site.";
    default:
      return "No visible action on this page yet.";
  }
}

function describeBanner(response) {
  if (!response?.hostname) {
    return "No recognized banner yet.";
  }

  if (!response.siteEnabled) {
    return "Banner handling is paused here.";
  }

  const detection = response.pageStatus?.currentDetection;
  if (detection?.type === "cmp") {
    return `Recognized banner: ${humanizeDetector(detection.id)}.`;
  }

  if (detection?.type === "generic") {
    return "Saw a cookie-related banner, but not a named one yet.";
  }

  const recentAdapters = response.runtimeStatus?.detectedAdapters || [];
  if (recentAdapters.length) {
    return `Recently recognized: ${recentAdapters.slice(0, 2).map(humanizeDetector).join(", ")}.`;
  }

  return "No recognized banner yet.";
}

function formatOutcomeLabel(label, siteEnabled) {
  if (!siteEnabled) {
    return "Paused";
  }

  if (label === "Hidden only") {
    return "Hidden";
  }

  if (label === "Blocked on load") {
    return "Protected";
  }

  if (label === "Cleared site state") {
    return "Cleared";
  }

  return label || "No action";
}

function outcomeColor(label) {
  if (label === "Rejected") {
    return { background: "#dff4df", color: "#1e6a3b" };
  }

  if (label === "Hidden") {
    return { background: "#ecf3ff", color: "#2457a6" };
  }

  if (label === "Protected") {
    return { background: "#f4ead9", color: "#7a5327" };
  }

  if (label === "Cleared") {
    return { background: "#e8f7f2", color: "#1a6b58" };
  }

  if (label === "Cookies blocked") {
    return { background: "#fde5e0", color: "#a03d2d" };
  }

  if (label === "Session-only") {
    return { background: "#fff1d9", color: "#9d5c18" };
  }

  if (label === "Paused") {
    return { background: "#efe6d7", color: "#6b5439" };
  }

  return { background: "#efe6d7", color: "#6b5439" };
}

function humanizeMode(mode) {
  if (mode === "visual_only") {
    return "Hide only";
  }

  if (mode === "strict_reject") {
    return "Stronger reject";
  }

  return "Recommended";
}

function humanizeDetector(value) {
  const normalized = String(value || "").replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatHostname(hostname) {
  if (hostname === "__local_file__") {
    return "Local fixture page";
  }

  return hostname || "Unsupported or internal page";
}

function isNormalWebUrl(value) {
  try {
    const url = new URL(value || "");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function setStatus(message) {
  statusText.textContent = message || "";
}
