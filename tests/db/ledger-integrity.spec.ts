import { test, expect } from '../support/fixtures';
import { ACCOUNTS, FEE_ACCOUNT, TOTAL_SYSTEM_MONEY } from '../support/test-data';
import type { WalletApi } from '../support/wallet-api';

const { rahim: R, karim: K, agent: A } = ACCOUNTS;

/**
 * Backend validation with SQL. The API can say "success" while the data is wrong,
 * so these tests check the database directly after a realistic mix of transactions.
 */
async function runBusinessDay(rahim: WalletApi, karim: WalletApi, agent: WalletApi) {
  expect((await agent.cashIn(R.phone, 3000, A.pin)).status()).toBe(201);
  expect((await agent.cashIn(K.phone, 750.5, A.pin)).status()).toBe(201);
  expect((await rahim.sendMoney(K.phone, 1200, R.pin)).status()).toBe(201);
  expect((await rahim.sendMoney(K.phone, 80, R.pin)).status()).toBe(201); // free tier
  expect((await karim.sendMoney(R.phone, 333.33, K.pin)).status()).toBe(201);
  expect((await rahim.cashOut(A.phone, 1234.56, R.pin)).status()).toBe(201);
  expect((await karim.cashOut(A.phone, 500, K.pin)).status()).toBe(201);
  // Failed attempts that must leave no trace:
  expect((await karim.sendMoney(R.phone, 999999, K.pin)).status()).toBe(400);
  expect((await rahim.cashOut(A.phone, 100, '0000')).status()).toBe(401);
}

test.describe('Ledger & data integrity (SQL)', () => {
  test.beforeEach(async ({ rahim, karim, agent }) => {
    await runBusinessDay(rahim, karim, agent);
  });

  test('TC-DB-01 only successful transactions are stored (7 rows)', async ({ db }) => {
    const row = db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number };
    expect(row.n).toBe(7);
  });

  test('TC-DB-02 every transaction is balanced: SUM(debit) = SUM(credit)', async ({ db }) => {
    const unbalanced = db.prepare(`
      SELECT trx_id, ROUND(SUM(debit), 2) AS d, ROUND(SUM(credit), 2) AS c
      FROM ledger_entries
      GROUP BY trx_id
      HAVING ROUND(SUM(debit), 2) <> ROUND(SUM(credit), 2)
    `).all();
    expect(unbalanced).toEqual([]);
  });

  test('TC-DB-03 every transaction has ledger entries and no orphan entries exist', async ({ db }) => {
    const missing = db.prepare(`
      SELECT t.trx_id FROM transactions t
      LEFT JOIN ledger_entries l ON l.trx_id = t.trx_id
      WHERE l.id IS NULL
    `).all();
    const orphans = db.prepare(`
      SELECT l.trx_id FROM ledger_entries l
      LEFT JOIN transactions t ON t.trx_id = l.trx_id
      WHERE t.id IS NULL
    `).all();
    expect(missing).toEqual([]);
    expect(orphans).toEqual([]);
  });

  test('TC-DB-04 total money in the system is conserved', async ({ db }) => {
    const row = db.prepare('SELECT ROUND(SUM(balance), 2) AS total FROM accounts').get() as { total: number };
    expect(row.total).toBe(TOTAL_SYSTEM_MONEY);
  });

  test('TC-DB-05 each balance equals seed + credits − debits from the ledger', async ({ db }) => {
    const seed: Record<string, number> = {
      [R.phone]: R.balance, [K.phone]: K.balance, [A.phone]: A.balance, [FEE_ACCOUNT]: 0,
    };
    const rows = db.prepare(`
      SELECT a.phone, a.balance,
             ROUND(COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0), 2) AS net
      FROM accounts a
      LEFT JOIN ledger_entries l ON l.phone = a.phone
      GROUP BY a.phone
    `).all() as { phone: string; balance: number; net: number }[];

    for (const r of rows) {
      expect(r.balance, `balance of ${r.phone}`).toBeCloseTo(seed[r.phone] + r.net, 2);
    }
  });

  test('TC-DB-06 fee account balance equals the sum of all fees charged', async ({ db }) => {
    const fees = db.prepare('SELECT ROUND(SUM(fee), 2) AS total FROM transactions').get() as { total: number };
    const feeAcc = db.prepare('SELECT balance FROM accounts WHERE phone = ?').get(FEE_ACCOUNT) as { balance: number };
    // 5 + 0 + 5 (send money) + 22.84 + 9.25 (cash out)
    expect(fees.total).toBe(42.09);
    expect(feeAcc.balance).toBe(fees.total);
  });

  test('TC-DB-07 no account has a negative balance', async ({ db }) => {
    const negatives = db.prepare('SELECT phone, balance FROM accounts WHERE balance < 0').all();
    expect(negatives).toEqual([]);
  });

  test('TC-DB-08 PINs are never exposed by balance or history APIs', async ({ rahim }) => {
    const history = await (await rahim.transactions()).json();
    const balance = await (await rahim.balanceRaw()).json();
    for (const item of [...history, balance]) {
      expect(Object.keys(item).map((k) => k.toLowerCase())).not.toContain('pin');
    }
  });
});
