/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — ui/panels/panel.ts
   The contract every sheet panel implements.

   WHY props-in and nothing else: the panels are shells. Skills,
   inventory, base and economy systems own the truth; they call
   setProps() with a plain data object and the panel renders it. No
   panel reads global state, and no panel writes it — intent leaves
   through the callbacks in its own props. That keeps the UI
   swappable and lets other agents develop against a fixed surface.
   ═══════════════════════════════════════════════════════════════ */

import "./panels.css";

export interface Panel<P> {
  /** Root node handed to the sheet. Stable for the panel's lifetime. */
  readonly node: HTMLElement;
  /** Text for the sheet header. */
  readonly eyebrow: string;
  readonly title: string;
  /** Merge-in update. Only the keys present are applied. */
  setProps(next: Partial<P>): void;
  /** Read-only view of what the panel currently believes. */
  readonly props: P;
  /** Optional controls the sheet puts in its header bar. */
  headerActions?(): Node[];
  /** Sheet became visible / hidden — cheap place to pause tickers. */
  onShow?(): void;
  onHide?(): void;
  destroy?(): void;
}

/** Shared plumbing: prop merging plus a render debounced to a frame. */
export abstract class BasePanel<P extends object> implements Panel<P> {
  abstract readonly node: HTMLElement;
  abstract readonly eyebrow: string;
  abstract readonly title: string;

  protected state: P;
  private queued = false;

  constructor(initial: P) {
    this.state = initial;
  }

  get props(): P { return this.state; }

  setProps(next: Partial<P>): void {
    let changed = false;
    for (const k of Object.keys(next) as Array<keyof P>) {
      const v = next[k];
      if (v !== undefined && this.state[k] !== v) {
        this.state[k] = v as P[keyof P];
        changed = true;
      }
    }
    // Arrays are usually replaced wholesale by the owning system, but a
    // caller may mutate in place; a forced flag covers that.
    if (changed || (next as { force?: boolean }).force) this.invalidate();
  }

  /** Coalesce N setProps calls in one tick into a single render. */
  protected invalidate(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.render(); });
  }

  protected abstract render(): void;
}
