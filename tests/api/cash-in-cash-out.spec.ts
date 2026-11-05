import { test, expect } from '../support/fixtures';
import { ACCOUNTS, cashOutFee } from '../support/test-data';

const { rahim: R, karim: K, agent: A } = ACCOUNTS;

test.describe('Cash In API (agent → customer)', () => {
  test('TC-CI-01 agent cash-in credits customer with no fee @smoke', async ({ agent, rahim }) => {
    const res = await agent.cashIn(R.phone, 2000, A.pin);
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ type: 'CASH_IN', amount: 2000, fee: 0 });
    expect(await rahim.balance()).toBe(R.balance + 2000);
    expect(await agent.balance()).toBe(A.balance - 2000);
  });

  for (const { amount, status } of [
    { amount: 49.99, status: 400 },
    { amount: 50, status: 201 },
    { amount: 30000, status: 201 },
    { amount: 30000.01, status: 400 },
  ]) {
    test(`TC-CI-02 BVA cash-in amount ${amount} → ${status}`, async ({ agent }) => {
      expect((await agent.cashIn(R.phone, amount, A.pin)).status()).toBe(status);
    });
  }

  test('TC-CI-03 customer cannot perform cash-in (role check)', async ({ rahim }) => {
    expect((await rahim.cashIn(K.phone, 500, R.pin)).status()).toBe(403);
  });

  test('TC-CI-04 cash-in to an agent number is rejected', async ({ agent }) => {
    expect((await agent.cashIn(A.phone, 500, A.pin)).status()).toBe(404);
  });
});

test.describe('Cash Out API (customer → agent, 1.85% fee)', () => {
  // Fee calculation table, including amounts where rounding matters.
  for (const amount of [50, 100, 1000, 1234.56, 2500]) {
    test(`TC-CO-01 fee for ${amount} BDT is ${cashOutFee(amount)}`, async ({ rahim, agent }) => {
      const res = await rahim.cashOut(A.phone, amount, R.pin);
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.fee).toBe(cashOutFee(amount));
      expect(await rahim.balance()).toBeCloseTo(R.balance - amount - body.fee, 2);
      // The agent receives the amount only; the fee goes to the system fee account.
      expect(await agent.balance()).toBeCloseTo(A.balance + amount, 2);
    });
  }

  test('TC-CO-02 balance must cover amount + fee (4909.18 + 90.82 = 5000.00 exactly)', async ({ rahim }) => {
    const res = await rahim.cashOut(A.phone, 4909.18, R.pin);
    expect(res.status()).toBe(201);
    expect(await rahim.balance()).toBe(0);
  });

  test('TC-CO-03 one paisa more than affordable is rejected (4909.19 + 90.82 = 5000.01)', async ({ rahim }) => {
    const res = await rahim.cashOut(A.phone, 4909.19, R.pin);
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_BALANCE' });
    expect(await rahim.balance()).toBe(R.balance);
  });

  test('TC-CO-04 cash-out below minimum (49.99) is rejected', async ({ rahim }) => {
    expect((await rahim.cashOut(A.phone, 49.99, R.pin)).status()).toBe(400);
  });

  test('TC-CO-05 cash-out to a customer number is rejected', async ({ rahim }) => {
    const res = await rahim.cashOut(K.phone, 500, R.pin);
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'RECEIVER_NOT_FOUND' });
  });

  test('TC-CO-06 cash-out with wrong PIN does not move money', async ({ rahim }) => {
    expect((await rahim.cashOut(A.phone, 500, '0000')).status()).toBe(401);
    expect(await rahim.balance()).toBe(R.balance);
  });
});
