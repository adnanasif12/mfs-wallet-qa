import { test as base, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { WalletApi } from './wallet-api';
import { ACCOUNTS } from './test-data';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'test-wallet.db');

type Fixtures = {
  resetData: void;
  rahim: WalletApi;
  karim: WalletApi;
  agent: WalletApi;
  anon: WalletApi;
  db: DatabaseSync;
};

export const test = base.extend<Fixtures>({
  // Runs automatically before every test so each test starts from the same seed data.
  resetData: [
    async ({ request }, use) => {
      const res = await request.post('/api/test/reset');
      expect(res.ok(), 'database reset').toBeTruthy();
      await use();
    },
    { auto: true },
  ],

  // Logged-in API clients. They depend on resetData so login always happens after the reset.
  rahim: async ({ request, resetData }, use) => { void resetData; await use(await WalletApi.loginAs(request, ACCOUNTS.rahim)); },
  karim: async ({ request, resetData }, use) => { void resetData; await use(await WalletApi.loginAs(request, ACCOUNTS.karim)); },
  agent: async ({ request, resetData }, use) => { void resetData; await use(await WalletApi.loginAs(request, ACCOUNTS.agent)); },
  anon: async ({ request, resetData }, use) => { void resetData; await use(new WalletApi(request)); },

  // Read-only connection for backend validation with SQL.
  db: async ({}, use) => {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    await use(db);
    db.close();
  },
});

export { expect };
