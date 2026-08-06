/* ═══════════════════════════════════════════════════════════════
   TIDEFALL — actors/index.ts
   The one import the rest of the game needs:

     import { ActorSystem } from "./actors";
     systems.push(new ActorSystem({ layers }));
   ═══════════════════════════════════════════════════════════════ */

export { ActorSystem } from "./actor-system";
export type {
  ActorSystemOptions, SpawnOptions,
  WalkCommand, WorkCommand, PlayCommand, AppearanceCommand,
} from "./actor-system";

export { Actor } from "./actor";
export type { ActorOptions, ArriveHandler, Facing } from "./actor";

export { Animator, ANIM_STATES, ANIM_STATE_IDS, motionFlash, motionOffsetX, motionOffsetY } from "./animation";
export type { AnimPlayOptions, AnimStateDef, AnimStateId, MotionProfile } from "./animation";

export {
  Paperdoll, PortraitView, drawPortrait,
  PAPERDOLL_LAYERS, PAPERDOLL_LAYER_SLOTS, PAPERDOLL_ART_ROOT, PAPERDOLL_ART_PATTERN,
  paperdollArtManifest, paperdollArtManifestMinimal,
} from "./paperdoll";
export type { ArtRequest, PaperdollLayer, PaperdollOptions } from "./paperdoll";

export { CharacterCreator } from "./creator";
export type {
  CharacterCreatorOptions, CreatorCategory, CreatorCategoryId, CreatorCategoryKind,
  CreatorOption, PreviewHandle, PreviewOptions,
} from "./creator";

export { SheetPack, SHEET_DEFS, HEAD_ASPECT, BAND_IDS } from "./sheets";
export type { BandId, BandPlacement, FrameAnchor, LoadedSheet, SheetDef, SheetId } from "./sheets";

export {
  APPEARANCE_VERSION, ART_BASE_SKIN, BODY_TYPES, DEFAULT_EQUIPMENT, EQUIPMENT,
  EQUIPMENT_BY_SLOT, EQUIP_SLOTS, EYE_COLORS, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES,
  appearanceEquals, cloneAppearance, defaultAppearance, deserializeAppearance,
  getBodyType, getEquipped, getEyeColor, getFaceShape, getHairColor, getHairStyle,
  getItem, getSkinTone, isEmptyItem, normalizeAppearance, randomAppearance,
  seededRng, serializeAppearance,
} from "./character";
export type {
  AppearanceOption, BodyTypeId, BodyTypeOption, CharacterAppearance, ColorOption,
  EquipItem, EquipShape, EquipSlot, EquipmentSet, FaceShape, FaceShapeOption,
  HairShape, HairStyleOption, Rng,
} from "./character";
