export { createRng } from './rng';
export type { Rng } from './rng';

export { INGREDIENTS, TOPPINGS, RECIPES, STARTING_RECIPES } from './recipes';
export type { Ingredient, Topping, Recipe, IngredientId, ToppingId, RecipeId } from './recipes';

export { SHOP_TIERS, getTier, nextTier } from './shop';
export type { ShopTier, ShopTierId } from './shop';

export { PHASES, createClock, tickClock } from './clock';
export type { DayClock, PhaseId, PhaseSpec } from './clock';

export { COATS, COAT_IDS, createCustomer, regularPatienceBonus } from './customers';
export type { CatCustomer, Coat, CoatId, CustomerPreferences } from './customers';

export { createStaff, createStaffModel, dailyWages, stationCapacity } from './staff';
export type { StaffMember, StaffModel, StaffRoster } from './staff';

export {
  FISH_COINS,
  REPUTATION_STARS,
  MAX_REPUTATION,
  createEconomy,
  bowlPrice,
  bowlCost,
  reputationGain,
} from './economy';
export type { Economy } from './economy';

export { dailyDemand, generateOrder } from './orders';
export type { Order } from './orders';

export { SIM_VERSION, createSimState } from './state';
export type { SimState, DayReport } from './state';

export { advanceDay, runSimulation } from './simulate';

export {
  FURNITURE,
  getFurniture,
  sellValue,
  SELL_REFUND_RATE,
  APPEAL_COUNT_CAP,
  APPEAL_DEMAND_PER_POINT,
  SEATS_PER_STOVE,
} from './catalog';
export type { FurnitureDef, FurnitureKind } from './catalog';

export {
  activeSeats,
  appealScore,
  cookSpot,
  defaultItems,
  entryCell,
  isSolid,
  layoutDemandMultiplier,
  nextRotation,
  validateLayout,
} from './layoutRules';
export type { BuildItem, GridCell, LayoutIssue, Rotation, Violation } from './layoutRules';

export {
  checkPlacement,
  describeBuildError,
  itemAt,
  moveItem,
  placeItem,
  rotateItem,
  seatCount,
  sellItem,
  upgradeInfo,
  upgradeTier,
} from './build';
export type { BuildError, BuildResult, UpgradeInfo } from './build';

export { planService, SERVICE_BEATS, SEAT_TURNOVER_BEATS } from './service';
export type { ServicePlan, ServiceVisit } from './service';

export {
  MIN_ACCEPT_QUALITY,
  isFailedOrder,
  comboMultiplier,
  reputationDeltaForQuality,
  rushBonus,
  scoreBowl,
  scoreBroth,
  scoreNoodles,
  scoreToppings,
  settleBowl,
  tipForQuality,
} from './cooking';
export type {
  BowlPayout,
  BrothResult,
  BrothVerdict,
  CookMeasurements,
  CookScore,
  CookStepId,
  NoodleResult,
  NoodleVerdict,
  StepScore,
  ToppingResult,
  ToppingVerdict,
} from './cooking';

export {
  EQUIPMENT,
  MASTERY_MAX,
  MASTERY_PRICE_PER_LEVEL,
  MASTERY_QUALITY_PER_LEVEL,
  MASTERY_STARS,
  RECIPE_UNLOCKS,
  STAFF_HIRE_COST,
  STAFF_HIRE_STARS,
  STAFF_LEVEL_MAX,
  STAFF_MAX,
  buyEquipment,
  describeProgressionError,
  hireStaff,
  levelStaff,
  masteryCost,
  staffLevelCost,
  starUnlocks,
  trainMastery,
  unlockRecipe,
} from './progression';
export type { ActionResult, EquipmentDef, ProgressionError } from './progression';

export {
  PRICE_ADJUST_MAX,
  PRICE_ADJUST_MIN,
  PRICE_STEP,
  STOCK_BOWL_COST,
  STOCK_CAP,
  adjustPrice,
  buyStock,
  effectiveMenu,
  salePrice,
  toggleMenu,
} from './prep';

export {
  PLAYER_BOWLS,
  cookQuality,
  nextPrepClock,
  planDay,
  playerCapacity,
  settleDay,
  staffCapacity,
} from './day';
export type { DayResult } from './day';

export { STARTING_STOCK } from './state';
export type { ComplaintKind, EquipmentId } from './state';

export { MIGRATIONS, MigrationError, migrateState, validateState } from './migrations';
export {
  EXPORT_PREFIX,
  SAVE_FORMAT,
  SAVE_VERSION,
  SaveError,
  checksum,
  createSave,
  exportSaveString,
  importSaveString,
  parseSave,
  serializeSave,
} from './save';
export type { SaveFile } from './save';

export { autopilotDay, autopilotPrep, autopilotRun } from './autopilot';
