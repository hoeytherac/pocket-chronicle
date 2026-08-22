export const MODULE_ID = "pocket-chronicle";
export const SOCKET_NAME = `module.${MODULE_ID}`;

export function clamp(value, minimum, maximum) {
  const number = Number(value) || 0;
  return Math.min(Math.max(number, minimum), maximum);
}

export function formatModifier(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : `${number}`;
}

export function isCompactViewport() {
  return isPhoneDevice() || (window.matchMedia?.("(max-width: 820px), (pointer: coarse)")?.matches ?? window.innerWidth <= 820);
}

export function isPhoneDevice() {
  const browserNavigator = globalThis.navigator ?? {};
  const browserWindow = globalThis.window ?? {};
  const browserScreen = browserWindow.screen ?? globalThis.screen ?? {};
  return detectPhoneDevice({
    userAgent: browserNavigator.userAgent,
    mobileHint: browserNavigator.userAgentData?.mobile,
    platform: browserNavigator.platform,
    touchPoints: browserNavigator.maxTouchPoints,
    screenWidth: browserScreen.width,
    screenHeight: browserScreen.height,
    innerWidth: browserWindow.innerWidth,
    innerHeight: browserWindow.innerHeight
  });
}

export function detectPhoneDevice(signals = {}) {
  const userAgent = signals.userAgent ?? "";
  const mobileHint = signals.mobileHint === true;
  const mobileAgent = /Android|webOS|iPhone|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent);
  const touchPoints = Number(signals.touchPoints) || 0;
  const iPadAgent = /iPad/i.test(userAgent) || (signals.platform === "MacIntel" && touchPoints > 1);
  const screenWidth = Number(signals.screenWidth) || Number(signals.innerWidth) || 9999;
  const screenHeight = Number(signals.screenHeight) || Number(signals.innerHeight) || 9999;
  const shortScreenEdge = Math.min(screenWidth, screenHeight);
  const touchSizedDevice = touchPoints > 1 && shortScreenEdge <= 1024;
  return mobileHint || mobileAgent || iPadAgent || touchSizedDevice;
}

export function primaryActiveGM() {
  if (game.users?.activeGM) return game.users.activeGM;
  return Array.from(game.users ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

export function safeArraySetting(key) {
  const value = game.settings.get(MODULE_ID, key);
  return Array.isArray(value) ? value : [];
}

export function getDocumentUuid(document) {
  return document?.uuid ?? document?.document?.uuid ?? null;
}

export function documentIsVisible(document, user = game.user) {
  if (!document) return false;
  if (user?.isGM) return true;
  if (document.visible === false) return false;
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
  return document.testUserPermission?.(user, observer) ?? document.visible ?? false;
}

export function normalizePrice(value, denomination = "gp") {
  const number = Math.max(0, Number(value) || 0);
  const allowed = ["cp", "sp", "ep", "gp", "pp"];
  return {
    value: Math.round(number * 100) / 100,
    denomination: allowed.includes(denomination) ? denomination : "gp"
  };
}

export function makeDiceFormula(faces, count = 1, modifier = 0, mode = "normal") {
  const dieFaces = clamp(Number(faces), 2, 100);
  let dieCount = clamp(Number(count), 1, 20);
  let suffix = "";
  if (dieFaces === 20 && mode === "advantage") {
    dieCount = Math.max(2, dieCount);
    suffix = "kh";
  } else if (dieFaces === 20 && mode === "disadvantage") {
    dieCount = Math.max(2, dieCount);
    suffix = "kl";
  }
  const mod = Number(modifier) || 0;
  return `${dieCount}d${dieFaces}${suffix}${mod === 0 ? "" : mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`}`;
}

export function debounce(callback, wait = 150) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), wait);
  };
}
