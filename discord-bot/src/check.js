import { access } from 'node:fs/promises';
import { readConfig } from './config.js';
try {
  readConfig();
  await access(new URL('../assets/devilhub.png', import.meta.url));
  console.log('Bot configuration and image are ready; secrets are not displayed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
