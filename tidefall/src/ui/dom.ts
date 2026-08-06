/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/dom.ts
   A 60-line DOM toolkit instead of a framework.

   WHY: this UI updates every frame (currency ticks, xp bars) on a
   phone that is also running a WebGL scene. Virtual DOM diffing is
   the wrong trade. The rule everywhere in src/ui is: build nodes
   once, keep handles to the few that change, write text/transform
   directly. These helpers make that ergonomic.
   ═══════════════════════════════════════════════════════════════ */

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Kid = Node | string | null | undefined | false;

/** el("div.card.is-hot", { role: "button" }, ...children) */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | string,
  attrs?: Attrs,
  ...kids: Kid[]
): HTMLElement {
  const [tagPart, ...classes] = spec.split(".");
  const node = document.createElement(tagPart || "div");
  if (classes.length) node.className = classes.join(" ");
  applyAttrs(node, attrs);
  append(node, kids);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Same idea for SVG, which needs the namespace. */
export function svg(spec: string, attrs?: Attrs, ...kids: Kid[]): SVGElement {
  const [tagPart, ...classes] = spec.split(".");
  const node = document.createElementNS(SVG_NS, tagPart || "svg");
  if (classes.length) node.setAttribute("class", classes.join(" "));
  applyAttrs(node as unknown as HTMLElement, attrs);
  append(node as unknown as HTMLElement, kids);
  return node as SVGElement;
}

function applyAttrs(node: Element, attrs?: Attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") { node.textContent = String(v); continue; }
    if (k === "html") { node.innerHTML = String(v); continue; }
    if (k === "style") { (node as HTMLElement).style.cssText = String(v); continue; }
    node.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(node: Element, kids: Kid[]) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
}

/** Replace children in one shot — used only when a list truly changes. */
export function fill(node: Element, ...kids: Kid[]): void {
  node.textContent = "";
  append(node, kids);
}

/** Write text only when it actually differs (avoids layout thrash). */
export function setText(node: Element, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

export function toggle(node: Element, cls: string, on: boolean): void {
  node.classList.toggle(cls, on);
}

/**
 * Keyed list reconciler for the handful of places where the item set
 * changes (bag contents, toasts). Reuses nodes for stable keys so we
 * never rebuild a 60-tile grid to change one stack count.
 */
export function reconcile<T>(
  parent: Element,
  items: readonly T[],
  keyOf: (item: T, i: number) => string,
  create: (item: T, key: string) => HTMLElement,
  update: (node: HTMLElement, item: T, key: string) => void,
  cache: Map<string, HTMLElement>,
): void {
  const seen = new Set<string>();
  let cursor: ChildNode | null = parent.firstChild;

  items.forEach((item, i) => {
    const key = keyOf(item, i);
    seen.add(key);
    let node = cache.get(key);
    if (!node) {
      node = create(item, key);
      cache.set(key, node);
    }
    update(node, item, key);
    if (cursor === node) {
      cursor = node.nextSibling;
    } else {
      parent.insertBefore(node, cursor);
    }
  });

  for (const [key, node] of cache) {
    if (!seen.has(key)) { node.remove(); cache.delete(key); }
  }
}

/** addEventListener that hands back its own disposer. */
export function on<E extends Event = Event>(
  target: EventTarget,
  type: string,
  fn: (ev: E) => void,
  opts?: AddEventListenerOptions | boolean,
): () => void {
  const h = fn as EventListener;
  target.addEventListener(type, h, opts);
  return () => target.removeEventListener(type, h, opts);
}

/** Next animation frame as a promise — for "paint, then animate". */
export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
