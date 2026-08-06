/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/creator.ts
   The character creator ENGINE. Headless on purpose: no DOM, no
   layout, no opinions about buttons. The UI asks for categories,
   asks for options, applies one, and mounts a live preview into a
   Pixi container it owns.

   Everything a row needs (label, swatch colours, selected flag) is
   in the data it hands back, so the UI never imports the model.
   ═══════════════════════════════════════════════════════════════ */

import { Container } from "pixi.js";
import type { AnimStateId } from "./animation";
import { Actor } from "./actor";
import { PortraitView } from "./paperdoll";
import type { SheetPack } from "./sheets";
import {
  BODY_TYPES, EQUIPMENT_BY_SLOT, EYE_COLORS, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES,
  cloneAppearance, defaultAppearance, deserializeAppearance, normalizeAppearance,
  randomAppearance, serializeAppearance,
} from "./character";
import type {
  AppearanceOption, BodyTypeId, CharacterAppearance, EquipSlot, Rng,
} from "./character";

export type CreatorCategoryId =
  | "bodyType" | "skinTone" | "faceShape" | "eyeColor" | "hairStyle" | "hairColor"
  | EquipSlot;

export type CreatorCategoryKind = "appearance" | "equipment";

export interface CreatorOption {
  readonly id: string;
  readonly name: string;
  /** 1–3 colours for a swatch chip. */
  readonly swatch: readonly number[];
  /** Equipment only: 0 starter … 4 late game. */
  readonly tier: number;
  readonly selected: boolean;
}

export interface CreatorCategory {
  readonly id: CreatorCategoryId;
  readonly name: string;
  readonly kind: CreatorCategoryKind;
  readonly selectedId: string | null;
  readonly options: readonly CreatorOption[];
}

interface CategoryDef {
  id: CreatorCategoryId;
  name: string;
  kind: CreatorCategoryKind;
  list: readonly AppearanceOption[];
  get: (a: CharacterAppearance) => string | null;
  set: (a: CharacterAppearance, id: string) => void;
}

const CATEGORY_DEFS: readonly CategoryDef[] = [
  { id: "bodyType", name: "Build", kind: "appearance", list: BODY_TYPES,
    get: (a) => a.bodyType, set: (a, id) => { a.bodyType = id as BodyTypeId; } },
  { id: "skinTone", name: "Skin", kind: "appearance", list: SKIN_TONES,
    get: (a) => a.skinTone, set: (a, id) => { a.skinTone = id; } },
  { id: "faceShape", name: "Face", kind: "appearance", list: FACE_SHAPES,
    get: (a) => a.faceShape, set: (a, id) => { a.faceShape = id; } },
  { id: "eyeColor", name: "Eyes", kind: "appearance", list: EYE_COLORS,
    get: (a) => a.eyeColor, set: (a, id) => { a.eyeColor = id; } },
  { id: "hairStyle", name: "Hair", kind: "appearance", list: HAIR_STYLES,
    get: (a) => a.hairStyle, set: (a, id) => { a.hairStyle = id; } },
  { id: "hairColor", name: "Hair Colour", kind: "appearance", list: HAIR_COLORS,
    get: (a) => a.hairColor, set: (a, id) => { a.hairColor = id; } },
  ...(
    [
      ["head", "Headgear"], ["chest", "Body"], ["legs", "Legs"], ["feet", "Feet"],
      ["mainHand", "Main Hand"], ["offHand", "Off Hand"], ["back", "Back"],
    ] as const
  ).map(([slot, name]): CategoryDef => ({
    id: slot, name, kind: "equipment", list: EQUIPMENT_BY_SLOT[slot],
    get: (a) => a.equipment[slot],
    set: (a, id) => { a.equipment[slot] = id; },
  })),
];

const DEF_BY_ID = new Map<CreatorCategoryId, CategoryDef>(CATEGORY_DEFS.map((d) => [d.id, d]));

/* ─────────────── live preview ─────────────── */

export interface PreviewOptions {
  /** Character height in design units. */
  height?: number;
  /** Where to sit the feet inside the container. */
  x?: number;
  y?: number;
  /** Pose to hold. Defaults to idle. */
  state?: AnimStateId;
  /** Add a bust above the body (the only place eye colour shows
      while we are still on full-character placeholder art). */
  portrait?: boolean;
  portraitSize?: number;
  portraitX?: number;
  portraitY?: number;
  facing?: 1 | -1;
}

export interface PreviewHandle {
  /** Added to the container you passed in; remove by calling destroy. */
  readonly root: Container;
  setState(state: AnimStateId): void;
  setFacing(dir: 1 | -1): void;
  /** Drive from your own ticker; dt in seconds. */
  update(dt: number): void;
  destroy(): void;
}

interface PreviewRig extends PreviewHandle {
  refresh(a: CharacterAppearance): void;
}

/* ─────────────── the creator ─────────────── */

export interface CharacterCreatorOptions {
  sheets: SheetPack;
  appearance?: CharacterAppearance;
}

export class CharacterCreator {
  private sheets: SheetPack;
  private state: CharacterAppearance;
  private listeners = new Set<(a: CharacterAppearance) => void>();
  private previews: PreviewRig[] = [];

  constructor(opts: CharacterCreatorOptions) {
    this.sheets = opts.sheets;
    this.state = opts.appearance ? normalizeAppearance(opts.appearance) : defaultAppearance();
  }

  /* ── reading ── */

  /** Live object — treat as read-only; use snapshot() to keep a copy. */
  get appearance(): CharacterAppearance { return this.state; }
  snapshot(): CharacterAppearance { return cloneAppearance(this.state); }
  get name(): string { return this.state.name; }

  listCategories(): CreatorCategory[] {
    return CATEGORY_DEFS.map((d) => this.buildCategory(d));
  }

  listOptions(category: CreatorCategoryId): CreatorOption[] {
    const d = DEF_BY_ID.get(category);
    return d ? this.buildCategory(d).options.slice() : [];
  }

  selected(category: CreatorCategoryId): string | null {
    const d = DEF_BY_ID.get(category);
    return d ? d.get(this.state) : null;
  }

  private buildCategory(d: CategoryDef): CreatorCategory {
    const cur = d.get(this.state);
    const options: CreatorOption[] = d.list.map((o) => ({
      id: o.id,
      name: o.name,
      swatch: o.swatch,
      tier: (o as { tier?: number }).tier ?? 0,
      selected: o.id === cur,
    }));
    return { id: d.id, name: d.name, kind: d.kind, selectedId: cur, options };
  }

  /* ── writing ── */

  /** Apply an option by id. Returns false for unknown ids. */
  apply(category: CreatorCategoryId, optionId: string): boolean {
    const d = DEF_BY_ID.get(category);
    if (!d || !d.list.some((o) => o.id === optionId)) return false;
    d.set(this.state, optionId);
    this.changed();
    return true;
  }

  /** Step through a category — the arrows either side of a row. */
  cycle(category: CreatorCategoryId, dir: 1 | -1 = 1): string | null {
    const d = DEF_BY_ID.get(category);
    if (!d || d.list.length === 0) return null;
    const cur = d.get(this.state);
    let i = d.list.findIndex((o) => o.id === cur);
    if (i < 0) i = 0;
    const next = d.list[(i + dir + d.list.length) % d.list.length];
    d.set(this.state, next.id);
    this.changed();
    return next.id;
  }

  setName(name: string): void {
    this.state.name = name.slice(0, 24);
    this.changed();
  }

  /** Fresh character; the name is kept unless you ask for a new one. */
  randomize(rng: Rng = Math.random, newName = false): CharacterAppearance {
    this.state = randomAppearance(rng, newName ? undefined : this.state.name);
    this.changed();
    return this.state;
  }

  reset(): CharacterAppearance {
    const name = this.state.name;
    this.state = defaultAppearance();
    this.state.name = name;
    this.changed();
    return this.state;
  }

  load(source: string | CharacterAppearance): CharacterAppearance {
    this.state = typeof source === "string" ? deserializeAppearance(source) : normalizeAppearance(source);
    this.changed();
    return this.state;
  }

  toJSON(): string { return serializeAppearance(this.state); }

  /* ── notifications ── */

  onChange(fn: (a: CharacterAppearance) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const p of this.previews) p.refresh(this.state);
    for (const fn of this.listeners) {
      try { fn(this.state); } catch (e) { console.error("[creator]", e); }
    }
  }

  /* ── preview ── */

  /** Mount a live, animating preview into a container the UI owns.
      Call handle.update(dt) from your ticker; destroy() when the
      screen closes. Safe to mount more than one. */
  mountPreview(container: Container, opts: PreviewOptions = {}): PreviewHandle {
    const root = new Container();
    const actor = new Actor({
      sheets: this.sheets,
      appearance: this.state,
      height: opts.height ?? 360,
      x: 0, y: 0,
      facing: opts.facing ?? 1,
    });
    actor.play(opts.state ?? "idle", { force: true });
    root.addChild(actor.view);
    actor.view.position.set(opts.x ?? 0, opts.y ?? 0);

    let portrait: PortraitView | null = null;
    if (opts.portrait) {
      portrait = new PortraitView(opts.portraitSize ?? 90);
      portrait.setAppearance(this.state);
      portrait.root.position.set(opts.portraitX ?? 0, opts.portraitY ?? -(opts.height ?? 360) - 90);
      root.addChild(portrait.root);
    }
    container.addChild(root);

    const rig: PreviewRig = {
      root,
      setState: (state) => actor.play(state, { force: true }),
      setFacing: (dir) => actor.setFacing(dir),
      update: (dt) => {
        actor.update(dt);
        actor.render(1);
        // the preview owns its own placement; ignore world depth
        actor.view.position.x += opts.x ?? 0;
        actor.view.position.y += opts.y ?? 0;
        actor.view.zIndex = 0;
      },
      refresh: (a) => {
        actor.setAppearance(a);
        portrait?.setAppearance(a);
      },
      destroy: () => {
        const i = this.previews.indexOf(rig);
        if (i >= 0) this.previews.splice(i, 1);
        actor.destroy();
        portrait?.destroy();
        root.destroy({ children: true });
      },
    };
    this.previews.push(rig);
    return rig;
  }

  destroy(): void {
    for (const p of this.previews.slice()) p.destroy();
    this.previews.length = 0;
    this.listeners.clear();
  }
}
