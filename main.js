
// 2D Evolution Simulator - minimal but extendable
// Everything in this file is plain JS, no libraries required.

const canvas = document.getElementById("worldCanvas");
const ctx = canvas.getContext("2d");

const speedSlider = document.getElementById("speedSlider");
const speedLabel = document.getElementById("speedLabel");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const yearDisplay = document.getElementById("yearDisplay");
const creatureCountDisplay = document.getElementById("creatureCount");
const speciesCountDisplay = document.getElementById("speciesCount");

// --- WORLD SETTINGS --------------------------------------------------------

const TILE_SIZE = 10;
const WORLD_WIDTH = Math.floor(canvas.width / TILE_SIZE);
const WORLD_HEIGHT = Math.floor(canvas.height / TILE_SIZE);

// Biomes
const BIOMES = ["water", "desert", "snowy", "woods", "swamp", "fields"];

// Simulation speed modes (number of sim steps per animation frame)
const SPEED_MODES = [
  { label: "Frozen", steps: 0 },
  { label: "Slow", steps: 1 },
  { label: "Normal", steps: 2 },
  { label: "Fast", steps: 4 },
  { label: "Ultra", steps: 8 }
];

// Species colors for rendering
const SPECIES_COLORS = [
  "#ff4b4b", "#4bafff", "#4bff6b", "#ffc14b", "#b64bff",
  "#ff4bf3", "#4bffec", "#ffd84b", "#ff8a4b", "#7cff4b"
];

// --- DATA STRUCTURES -------------------------------------------------------

let world = null;        // 2D array of biome types
let speciesList = [];    // array of species objects
let creatures = [];      // array of creature instances
let year = 0;
let paused = false;
let speedIndex = 2;      // default "Normal"

// Species definition
// movementMode: "terrestrial" | "water"
// dietType: "herbivore" | "carnivore" | "omnivore"
// isCannibal: bool
class Species {
  constructor(id, color, movementMode, dietType, isCannibal) {
    this.id = id;
    this.color = color;
    this.movementMode = movementMode;
    this.dietType = dietType;
    this.isCannibal = isCannibal;
  }
}

// Creature definition, containing traits
class Creature {
  constructor(species, x, y, sex, traits) {
    this.speciesId = species.id;
    this.color = species.color;
    this.movementMode = species.movementMode;
    this.dietType = species.dietType;
    this.isCannibal = species.isCannibal;
    this.x = x;
    this.y = y;
    this.sex = sex; // "M" or "F"
    this.age = 0;
    this.energy = 50; // starting energy
    this.traits = traits;
    this.alive = true;
  }
}

// Generate baseline traits (mostly neutral)
function createBaselineTraits() {
  return {
    // Body & movement
    size: 1.0,
    max_speed: 1.0,
    accel: 0.1,
    turn_speed: 0.2,
    armor: 0,
    attack_damage: 1,
    venom_power: 0,
    has_venom: false,
    stomach_capacity: 60,
    constriction_power: 0,
    ram_force: 0,
    tail_power: 0,
    bite_force: 1,

    // Sensory
    vision_radius: 5,
    fov: 180,
    detection_chance: 0.7,
    smell_range: 3,
    night_vision: 0.0,

    // Metabolism & survival
    metabolism_rate: 0.03, // base hunger increase per tick
    food_efficiency: 1.0,
    temp_tolerance: 0.0,
    toxin_resistance: 0.0,
    can_hibernate: false,
    disease_chance: 0.0,
    slime_thickness: 0.0,
    shell_hardness: 0.0,

    // Reproduction & lifecycle
    offspring_per_cycle: 1,
    repro_cooldown: 200, // ticks
    max_age: 2000,
    care_level: 0,

    // Behavior / AI
    aggression: 0.3,
    caution: 0.5,
    curiosity: 0.5,
    grouping: 0.2,
    territorial: 0.2,
    risk_taking: 0.3,

    // Camouflage & mimicry
    camo: 0.0,
    crypsis_level: 0.0,
    mimicry_level: 0.0,
    false_eye_spots: 0.0,

    // Escape & defenses
    can_burrow: false,
    burrow_speed: 0.0,
    spine_damage: 0.0,
    repellent_strength: 0.0,
    irritant_level: 0.0,
    can_autotomize: false,
    startle_power: 0.0,

    // Regeneration
    regen_rate: 0.0
  };
}

// --- WORLD GENERATION ------------------------------------------------------

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateBiomes() {
  // Choose 2–4 unique biomes, must include water
  const chosen = new Set();
  chosen.add("water");
  const n = 2 + Math.floor(Math.random() * 3); // 2,3,4
  while (chosen.size < n) {
    chosen.add(randomChoice(BIOMES));
  }
  return Array.from(chosen);
}

function generateWorld() {
  const allowedBiomes = generateBiomes();

  // Simple per-tile random assignment; not contiguous but easy.
  const grid = [];
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const biome = randomChoice(allowedBiomes);
      row.push(biome);
    }
    grid.push(row);
  }
  return grid;
}

// --- SPECIES & CREATURE GENERATION ----------------------------------------

function generateSpeciesList() {
  speciesList = [];
  const movementModes = ["terrestrial", "water"];
  const dietTypes = ["herbivore", "carnivore", "omnivore"];

  for (let i = 0; i < 10; i++) {
    const movementMode = randomChoice(movementModes);
    const dietType = randomChoice(dietTypes);
    const isCannibal = Math.random() < 0.3;
    const color = SPECIES_COLORS[i % SPECIES_COLORS.length];
    const s = new Species(i, color, movementMode, dietType, isCannibal);
    speciesList.push(s);
  }
}

function findRandomTileForSpecies(species) {
  // Aquatic species go in water tiles, terrestrial avoid water.
  let attempts = 0;
  while (attempts < 1000) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const biome = world[y][x];
    if (species.movementMode === "water") {
      if (biome === "water") return { x, y };
    } else {
      if (biome !== "water") return { x, y };
    }
    attempts++;
  }
  // fallback: anywhere
  return {
    x: Math.floor(Math.random() * WORLD_WIDTH),
    y: Math.floor(Math.random() * WORLD_HEIGHT)
  };
}

function spawnInitialCreatures() {
  creatures = [];
  speciesList.forEach(species => {
    const individuals = 15; // starting pop per species
    for (let i = 0; i < individuals; i++) {
      const pos = findRandomTileForSpecies(species);
      const sex = Math.random() < 0.5 ? "M" : "F";
      const traits = createBaselineTraits();
      // small random variation at start
      traits.max_speed *= 0.8 + Math.random() * 0.4;
      traits.attack_damage *= 0.8 + Math.random() * 0.4;
      traits.armor *= 0.8 + Math.random() * 0.4;
      const c = new Creature(species, pos.x, pos.y, sex, traits);
      creatures.push(c);
    }
  });
}

// --- MUTATION SYSTEM -------------------------------------------------------

// returns a deep-ish copy of traits
function cloneTraits(traits) {
  return JSON.parse(JSON.stringify(traits));
}

const MUTABLE_NUMERIC_TRAITS = [
  "size", "max_speed", "armor", "attack_damage", "venom_power",
  "vision_radius", "food_efficiency", "temp_tolerance",
  "toxin_resistance", "offspring_per_cycle", "repro_cooldown",
  "max_age", "aggression", "caution", "curiosity", "grouping",
  "territorial", "risk_taking", "camo", "crypsis_level",
  "mimicry_level", "false_eye_spots", "burrow_speed",
  "spine_damage", "repellent_strength", "irritant_level",
  "startle_power", "regen_rate"
];

const MUTABLE_BOOLEAN_TRAITS = [
  "has_venom", "can_hibernate", "can_burrow", "can_autotomize"
];

function applyMutation(traits) {
  const t = cloneTraits(traits);

  // Chance to flip a boolean trait (gain/lose a characteristic)
  if (Math.random() < 0.05) {
    const key = randomChoice(MUTABLE_BOOLEAN_TRAITS);
    t[key] = !t[key];
  }

  // Chance to adjust 1–2 numeric traits
  const numMutations = 1 + (Math.random() < 0.3 ? 1 : 0);
  for (let i = 0; i < numMutations; i++) {
    const key = randomChoice(MUTABLE_NUMERIC_TRAITS);
    const base = t[key] || 0;
    const delta = (Math.random() * 0.4 - 0.2); // -0.2 to +0.2
    let newValue = base + delta;

    // Simple clamping for some traits
    if (key === "size") newValue = Math.max(0.3, Math.min(newValue, 3));
    if (key === "max_speed") newValue = Math.max(0.2, Math.min(newValue, 4));
    if (key === "armor") newValue = Math.max(0, Math.min(newValue, 5));
    if (key === "attack_damage") newValue = Math.max(0.1, newValue);
    if (key === "offspring_per_cycle") newValue = Math.max(1, Math.min(newValue, 5));
    if (key === "repro_cooldown") newValue = Math.max(80, Math.min(newValue, 500));
    if (key === "vision_radius") newValue = Math.max(3, Math.min(newValue, 20));

    t[key] = newValue;
  }

  // Recalculate metabolism: base + complexity cost
  const complexity =
    t.size +
    t.armor * 0.5 +
    t.attack_damage * 0.3 +
    t.max_speed * 0.3 +
    t.vision_radius * 0.1 +
    (t.has_venom ? 2 : 0) +
    t.regen_rate * 2 +
    (t.can_burrow ? 1 : 0) +
    (t.can_hibernate ? 0.5 : 0);

  t.metabolism_rate = 0.02 + complexity * 0.003;

  return t;
}

// --- DIET & FOOD -----------------------------------------------------------

// For this minimal version, we treat "food" abstractly as energy sources:
// - herbivores: get food from certain biomes (e.g., woods, fields, swamp)
// - carnivores: get food by killing other creatures
// - omnivores: can do both but need more food

function biomeFoodValue(biome, dietType) {
  if (dietType === "herbivore") {
    if (biome === "woods" || biome === "fields" || biome === "swamp") return 1.0;
    return 0.2;
  }
  if (dietType === "omnivore") {
    if (biome === "woods" || biome === "fields" || biome === "swamp") return 0.7;
    return 0.3;
  }
  // pure carnivore gets little from biome plants
  return 0.1;
}

// --- SIMULATION LOOP -------------------------------------------------------

function getBiome(x, y) {
  if (y < 0 || y >= WORLD_HEIGHT || x < 0 || x >= WORLD_WIDTH) return "fields";
  return world[y][x];
}

function stepCreature(creature, index) {
  if (!creature.alive) return;

  // Age & hunger
  creature.age += 1;
  let hungerIncrease = creature.traits.metabolism_rate;

  // Omnivores need more food by design
  if (creature.dietType === "omnivore") {
    hungerIncrease *= 1.3;
  }

  creature.energy -= hungerIncrease;

  if (creature.age > creature.traits.max_age || creature.energy <= 0) {
    creature.alive = false;
    return;
  }

  // Regeneration
  creature.energy = Math.min(creature.traits.stomach_capacity, creature.energy + creature.traits.regen_rate);

  // Simple random walk movement, slightly biased by curiosity
  const biome = getBiome(creature.x, creature.y);
  const stepChance = 0.2 + creature.traits.curiosity * 0.3;
  if (Math.random() < stepChance) {
    const dir = Math.floor(Math.random() * 4);
    let nx = creature.x;
    let ny = creature.y;
    if (dir === 0) nx++;
    if (dir === 1) nx--;
    if (dir === 2) ny++;
    if (dir === 3) ny--;

    // restrict movement mode
    const nextBiome = getBiome(nx, ny);
    if (creature.movementMode === "water") {
      if (nextBiome === "water") {
        creature.x = Math.max(0, Math.min(WORLD_WIDTH - 1, nx));
        creature.y = Math.max(0, Math.min(WORLD_HEIGHT - 1, ny));
      }
    } else {
      if (nextBiome !== "water") {
        creature.x = Math.max(0, Math.min(WORLD_WIDTH - 1, nx));
        creature.y = Math.max(0, Math.min(WORLD_HEIGHT - 1, ny));
      }
    }
  }

  // Feed from biome if herbivore or omnivore
  const foodFromBiome = biomeFoodValue(biome, creature.dietType);
  creature.energy += foodFromBiome * 0.5 * creature.traits.food_efficiency;
  if (creature.energy > creature.traits.stomach_capacity) {
    creature.energy = creature.traits.stomach_capacity;
  }

  // Very simple combat/cannibalism / predation:
  // Occasionally look for nearby creature to attack if carnivore or cannibal.
  if (Math.random() < creature.traits.aggression * 0.05) {
    const target = findNearbyCreature(creature, 1);
    if (target && target.alive && target !== creature) {
      const sameSpecies = target.speciesId === creature.speciesId;
      const canAttackSame = creature.isCannibal;
      const isCarnivore = (creature.dietType === "carnivore" || creature.dietType === "omnivore");
      if (isCarnivore && (!sameSpecies || (sameSpecies && canAttackSame))) {
        resolveAttack(creature, target);
      }
    }
  }

  // Reproduction: simple chance if energy is high and recently not reproduced
  if (creature.energy > creature.traits.stomach_capacity * 0.7) {
    attemptReproduction(creature, index);
  }
}

function findNearbyCreature(creature, radius) {
  const r2 = radius * radius;
  for (let other of creatures) {
    if (!other.alive) continue;
    if (other === creature) continue;
    const dx = other.x - creature.x;
    const dy = other.y - creature.y;
    if (dx * dx + dy * dy <= r2) {
      return other;
    }
  }
  return null;
}

function resolveAttack(attacker, target) {
  // Damage based on attackDamage, armor, shell, etc.
  let damage = attacker.traits.attack_damage + attacker.traits.bite_force;
  const armor = target.traits.armor + target.traits.shell_hardness * 2;
  damage = Math.max(0, damage - armor);
  if (damage <= 0) return;

  // Instead of HP, we use energy as proxy for life
  target.energy -= damage * 5;

  // Spines retaliate
  if (target.traits.spine_damage > 0) {
    attacker.energy -= target.traits.spine_damage * 3;
  }

  // Venom
  if (attacker.traits.has_venom && attacker.traits.venom_power > 0) {
    target.energy -= attacker.traits.venom_power * 2;
  }

  if (target.energy <= 0) {
    target.alive = false;
    // attacker eats target
    attacker.energy = Math.min(
      attacker.traits.stomach_capacity,
      attacker.energy + 30 * attacker.traits.food_efficiency
    );
  }
}

function attemptReproduction(creature, index) {
  if (!creature.alive) return;
  // Use age mod as a simple cooldown
  if (creature.age % creature.traits.repro_cooldown !== 0) return;

  // Find mate: same species, opposite sex, nearby, enough energy
  const mate = creatures.find(other => {
    if (!other.alive) return false;
    if (other === creature) return false;
    if (other.speciesId !== creature.speciesId) return false;
    if (other.sex === creature.sex) return false;
    if (Math.abs(other.x - creature.x) > 1 || Math.abs(other.y - creature.y) > 1) return false;
    if (other.energy < other.traits.stomach_capacity * 0.5) return false;
    return true;
  });

  if (!mate) return;

  // "Do the thing" non-graphically: we just spawn offspring
  const offspringCount = Math.round(
    (creature.traits.offspring_per_cycle + mate.traits.offspring_per_cycle) / 2
  );

  for (let i = 0; i < offspringCount; i++) {
    const childSex = Math.random() < 0.5 ? "M" : "F";
    const childTraits = mixTraits(creature.traits, mate.traits);

    // Apply mutation with small chance
    if (Math.random() < 0.4) {
      const mutatedTraits = applyMutation(childTraits);
      creatures.push(new Creature(
        speciesList[creature.speciesId],
        creature.x,
        creature.y,
        childSex,
        mutatedTraits
      ));
    } else {
      creatures.push(new Creature(
        speciesList[creature.speciesId],
        creature.x,
        creature.y,
        childSex,
        childTraits
      ));
    }
  }

  // Energy cost for parents
  creature.energy *= 0.5;
  mate.energy *= 0.5;
}

function mixTraits(a, b) {
  const mixed = {};
  for (let key in a) {
    if (!Object.prototype.hasOwnProperty.call(a, key)) continue;
    const va = a[key];
    const vb = b[key];
    if (typeof va === "number" && typeof vb === "number") {
      mixed[key] = (va + vb) / 2;
    } else if (typeof va === "boolean" && typeof vb === "boolean") {
      mixed[key] = (Math.random() < 0.5) ? va : vb;
    } else {
      mixed[key] = va;
    }
  }
  return mixed;
}

// --- RENDERING -------------------------------------------------------------

function biomeColor(biome) {
  switch (biome) {
    case "water": return "#103354";
    case "desert": return "#c9ae5d";
    case "snowy": return "#e5f3ff";
    case "woods": return "#205b2f";
    case "swamp": return "#3b4b2b";
    case "fields": return "#6b8a3a";
    default: return "#000000";
  }
}

function drawWorld() {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      ctx.fillStyle = biomeColor(world[y][x]);
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawCreatures() {
  for (let c of creatures) {
    if (!c.alive) continue;
    ctx.fillStyle = c.color;
    const size = Math.max(3, Math.min(8, 3 + c.traits.size * 1.5));
    const px = c.x * TILE_SIZE + TILE_SIZE / 2;
    const py = c.y * TILE_SIZE + TILE_SIZE / 2;
    ctx.beginPath();
    ctx.arc(px, py, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- MAIN LOOP & CONTROLS --------------------------------------------------

function stepSimulation() {
  // Update creatures
  for (let i = 0; i < creatures.length; i++) {
    if (creatures[i].alive) {
      stepCreature(creatures[i], i);
    }
  }

  // Remove dead ones occasionally
  if (year % 5 === 0) {
    creatures = creatures.filter(c => c.alive);
  }

  // Advance "year" counter
  year += 0.01; // abstract, not a real year length
}

function updateStats() {
  yearDisplay.textContent = year.toFixed(1);
  const aliveCount = creatures.filter(c => c.alive).length;
  creatureCountDisplay.textContent = aliveCount;
  speciesCountDisplay.textContent = speciesList.length;
}

function loop() {
  const speedConfig = SPEED_MODES[speedIndex];

  if (!paused && speedConfig.steps > 0) {
    for (let i = 0; i < speedConfig.steps; i++) {
      stepSimulation();
    }
  }

  drawWorld();
  drawCreatures();
  updateStats();

  requestAnimationFrame(loop);
}

// --- INITIALIZATION --------------------------------------------------------

function initWorld() {
  world = generateWorld();
  generateSpeciesList();
  spawnInitialCreatures();
  year = 0;
}

function onSpeedChange() {
  speedIndex = parseInt(speedSlider.value, 10);
  speedLabel.textContent = SPEED_MODES[speedIndex].label;
}

function onPauseClick() {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
}

function onResetClick() {
  initWorld();
}

speedSlider.addEventListener("input", onSpeedChange);
pauseBtn.addEventListener("click", onPauseClick);
resetBtn.addEventListener("click", onResetClick);

// Start
onSpeedChange();
initWorld();
loop();
