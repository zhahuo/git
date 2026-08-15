import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  workers: 1,
  webServer: [
    {
      command: 'node ./server/index.mjs',
      url: 'http://127.0.0.1:2567',
      reuseExistingServer: true,
      env: { TEAM_SCORE_LIMIT: '1', CTF_SCORE_LIMIT: '3', CTF_FLAG_RETURN_MS: '5000', ROUNDS_TO_WIN: '1', MATCH_COUNTDOWN_MS: '0', ROUND_BREAK_MS: '0', DUEL_KILL_LIMIT: '3', SPAWN_PROTECTION_MS: '0', BASE_SAFE_ZONE_RADIUS: '0' },
    },
    {
      command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    },
  },
  reporter: [['list']],
});
