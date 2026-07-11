import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SPRITE_MANIFEST, VOICE_LINES, SFX_CLIPS, SPRITE_PX_PER_UNIT, SPRITE_OVERHANG,
} from '../src/game/core/assetManifest.js';
import { VEHICLE_CATALOG, TOW_TRUCK_CONFIG } from '../src/game/entities/vehicleCatalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

// --- 1. manifest <-> public files, both directions --------------------------
const groups = [
  ['sprites', Object.values(SPRITE_MANIFEST)],
  ['voice', VOICE_LINES.map((name) => `${name}.wav`)],
  ['sfx', SFX_CLIPS.map((name) => `${name}.mp3`)],
];
for (const [folder, expected] of groups) {
  const directory = path.join(root, 'public', 'assets', folder);
  const actual = existsSync(directory)
    ? readdirSync(directory).filter((name) => !name.startsWith('.')).sort()
    : [];
  for (const name of expected) {
    if (!actual.includes(name)) errors.push(`Missing public/assets/${folder}/${name}`);
  }
  for (const name of actual) {
    if (!expected.includes(name)) errors.push(`Unmanifested public/assets/${folder}/${name}`);
  }
}

// --- 2. vehicle sprite dimensions match the registration contract -----------
// process_art.py must output (length + 2*overhang) x (width + 2*overhang)
// world units at SPRITE_PX_PER_UNIT px per unit, mirroring vehicleCatalog.js.
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null; // 'IHDR'
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const vehicleConfigs = { ...VEHICLE_CATALOG, tow: TOW_TRUCK_CONFIG };
for (const [key, file] of Object.entries(SPRITE_MANIFEST)) {
  if (!key.startsWith('vehicle_')) continue;
  const type = key.slice('vehicle_'.length);
  const config = vehicleConfigs[type];
  if (!config) {
    errors.push(`Sprite ${key} has no matching entry in vehicleCatalog.js`);
    continue;
  }
  const target = path.join(root, 'public', 'assets', 'sprites', file);
  if (!existsSync(target)) continue; // reported by section 1
  const size = pngSize(target);
  const wantW = (config.length + 2 * SPRITE_OVERHANG) * SPRITE_PX_PER_UNIT;
  const wantH = (config.width + 2 * SPRITE_OVERHANG) * SPRITE_PX_PER_UNIT;
  if (!size || size.w !== wantW || size.h !== wantH) {
    errors.push(`Sprite ${file} is ${size ? `${size.w}x${size.h}` : 'unreadable'}, ` +
      `expected ${wantW}x${wantH} (catalog ${config.length}x${config.width} + overhang ` +
      `${SPRITE_OVERHANG} at ${SPRITE_PX_PER_UNIT}px/unit) — re-run scripts/process_art.py`);
  }
}

// --- 3. literal asset references in source point at declared keys -----------
const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) sourceFiles.push(full);
  }
})(path.join(root, 'src'));

const spriteKeys = new Set(Object.keys(SPRITE_MANIFEST));
const voiceKeys = new Set(VOICE_LINES);
const sfxKeys = new Set(SFX_CLIPS);
const voiceRegisters = ['bright', 'warm', 'deep'];

for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  for (const match of text.matchAll(/assets\.get(?:Tinted)?\(\s*'([^']+)'/g)) {
    if (!spriteKeys.has(match[1])) errors.push(`${relative} references undeclared sprite '${match[1]}'`);
  }
  for (const match of text.matchAll(/(?:sfx\.play|playSfx)(?:\?\.)?\(\s*'([^']+)'/g)) {
    if (!sfxKeys.has(match[1])) errors.push(`${relative} plays undeclared sfx '${match[1]}'`);
  }
  for (const match of text.matchAll(/\bsay\(\s*'([^']+)'/g)) {
    const key = match[1];
    const perRegister = voiceRegisters.every((register) => voiceKeys.has(`${key}_${register}`));
    if (!voiceKeys.has(key) && !perRegister) {
      errors.push(`${relative} says undeclared voice line '${key}'`);
    }
  }
}

// --- 4. generation script tables agree with the manifest --------------------
// Every shipped clip must be regenerable: manifest keys must exist in the gen
// scripts. Extra script entries are fine while assets are still landing.
function pythonKeys(script, expression) {
  try {
    const out = execFileSync('python3', ['-c',
      `import sys; sys.path.insert(0, ${JSON.stringify(path.join(root, 'scripts'))}); ${expression}`,
    ], { encoding: 'utf8' });
    return new Set(out.split('\n').map((line) => line.trim()).filter(Boolean));
  } catch (error) {
    errors.push(`Could not read ${script} tables (${String(error.message).split('\n')[0]})`);
    return null;
  }
}
const sfxTable = pythonKeys('gen_sfx.py', "from gen_sfx import SFX; print('\\n'.join(SFX))");
if (sfxTable) {
  for (const key of SFX_CLIPS) {
    if (!sfxTable.has(key)) errors.push(`SFX_CLIPS '${key}' missing from scripts/gen_sfx.py`);
  }
  const pending = [...sfxTable].filter((key) => !sfxKeys.has(key));
  if (pending.length) warnings.push(`gen_sfx.py has ${pending.length} entries not shipped yet`);
}
const voiceTable = pythonKeys('gen_voice.py', "from gen_voice import LINES; print('\\n'.join(LINES))");
if (voiceTable) {
  for (const key of VOICE_LINES) {
    if (!voiceTable.has(key)) errors.push(`VOICE_LINES '${key}' missing from scripts/gen_voice.py`);
  }
  const pending = [...voiceTable].filter((key) => !voiceKeys.has(key));
  if (pending.length) warnings.push(`gen_voice.py has ${pending.length} lines not shipped yet`);
}

// --- report ------------------------------------------------------------------
if (warnings.length) console.warn(warnings.map((warning) => `warn: ${warning}`).join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Asset manifest is in sync (${Object.keys(SPRITE_MANIFEST).length} sprites, ` +
  `${VOICE_LINES.length} voices, ${SFX_CLIPS.length} effects).`);
