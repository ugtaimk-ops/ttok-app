import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { englishText } from "./localization.en";

export type AppLanguage = "ko" | "en";

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatableAttributes = ["placeholder", "aria-label", "title", "alt"];
const korean = /[가-힣]/;
const whitespace = /^(\s*)(.*?)(\s*)$/s;
let language: AppLanguage = "ko";
let observer: MutationObserver | undefined;
let scheduled = false;

/** Translate text used by native browser dialogs that are outside the React tree. */
export function localizedText(value: string): string {
  return language === "en" ? translate(value) : value;
}

function translate(value: string): string {
  const match = whitespace.exec(value);
  if (!match || !korean.test(match[2])) return value;
  const text = match[2];
  let translated = englishText[text];
  if (!translated) {
    const grade = /^(\d+)학년$/.exec(text);
    const uses = /^(\d+)회$/.exec(text);
    const minutes = /^(\d+)분$/.exec(text);
    const question = /^(\d+)번$/.exec(text);
    const month = /^(\d{1,2})월$/.exec(text);
    const schoolGrade = /^(.+?)\s+(\d+)학년$/.exec(text);
    const usage = /^(\d+)\s*\/\s*(\d+)회$/.exec(text);
    const billingPeriod = /^(.+?)\s*\/\s*(월|년)$/.exec(text);
    if (grade) translated = `Grade ${grade[1]}`;
    else if (uses) translated = `${uses[1]} uses`;
    else if (minutes) translated = `${minutes[1]} min`;
    else if (question) translated = `No. ${question[1]}`;
    else if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12) {
      translated = new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2026, Number(month[1]) - 1, 1));
    }
    else if (schoolGrade) translated = `${schoolGrade[1]} · Grade ${schoolGrade[2]}`;
    else if (usage) translated = `${usage[1]} / ${usage[2]} uses`;
    else if (billingPeriod) translated = `${billingPeriod[1]} / ${billingPeriod[2] === "월" ? "month" : "year"}`;
  }
  if (translated) return match[1] + translated + match[3];
  return value;
}

function updateNode(node: Text): void {
  const current = node.nodeValue || "";
  const previous = originalText.get(node);
  if (previous === undefined || (current !== previous && current !== translate(previous))) {
    originalText.set(node, current);
  }
  const source = originalText.get(node) || current;
  const result = language === "en" ? translate(source) : source;
  if (current !== result) node.nodeValue = result;
}

function updateAttributes(element: Element): void {
  let sources = originalAttributes.get(element);
  if (!sources) {
    sources = new Map();
    originalAttributes.set(element, sources);
  }
  for (const name of translatableAttributes) {
    const current = element.getAttribute(name);
    if (current === null) continue;
    const previous = sources.get(name);
    if (previous === undefined || (current !== previous && current !== translate(previous))) {
      sources.set(name, current);
    }
    const source = sources.get(name) || current;
    const result = language === "en" ? translate(source) : source;
    if (current !== result) element.setAttribute(name, result);
  }
}

function applyLanguage(): void {
  // React portals (including the subscription paywall) render beside #root.
  const root = document.body;
  if (!root) return;
  observer?.disconnect();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) updateNode(node as Text);
    else if (node instanceof Element) updateAttributes(node);
    node = walker.nextNode();
  }
  document.documentElement.lang = language;
  observer?.observe(root, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: translatableAttributes,
  });
}

function scheduleUpdate(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyLanguage();
  });
}

async function readLanguage(): Promise<AppLanguage> {
  try {
    const tag = Capacitor.isNativePlatform()
      ? (await CapacitorApp.getAppLanguage()).value
      : navigator.language;
    return tag.toLowerCase().startsWith("en") ? "en" : "ko";
  } catch {
    return navigator.language.toLowerCase().startsWith("en") ? "en" : "ko";
  }
}

/** Follow the phone's app/system language. Unsupported languages use Korean. */
export function startLocalization(): void {
  language = navigator.language.toLowerCase().startsWith("en") ? "en" : "ko";
  observer = new MutationObserver(scheduleUpdate);
  scheduleUpdate();
  const refresh = () => { void readLanguage().then(next => { language = next; scheduleUpdate(); }); };
  refresh();
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener("appStateChange", state => { if (state.isActive) refresh(); });
  } else {
    window.addEventListener("languagechange", refresh);
  }
}
