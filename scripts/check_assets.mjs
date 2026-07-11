import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SPRITE_MANIFEST, VOICE_LINES, SFX_CLIPS } from '../src/game/core/assetManifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = [
  ['sprites', Object.values(SPRITE_MANIFEST)],
  ['voice', VOICE_LINES.map((name) => `${name}.wav`)],
  ['sfx', SFX_CLIPS.map((name) => `${name}.mp3`)],
];

const errors = [];
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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Asset manifest is in sync (${Object.keys(SPRITE_MANIFEST).length} sprites, ${VOICE_LINES.length} voices, ${SFX_CLIPS.length} effects).`);
