import { test, expect } from '../support/fixtures';
import { ACCOUNTS, UNREGISTERED_PHONE, sendMoneyFee } from '../support/test-data';

const { rahim: R, karim: K, agent: A } = ACCOUNTS;

test.describe('Send Money API', () => {
  test('TC-SM-01 successful send money debits sender (amount + fee) and credits receiver @smoke', async ({ rahim, karim }) => {
    const res = await rahim.sendMoney(K.phone, 500, R.pin);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'SEND_MONEY', amount: 500, fee: 5, from: R.phone, to: K.phone });
    expect(body.trxId).toMatch(/^TRX[0-9A-F]{10}$/);

    expect(await rahim.balance()).toBe(R.balance - 505);
    expect(await karim.balance()).toBe(K.balance + 500);
  });

  // Boundary Value Analysis on amount (min 10, max 25000) and on the fee threshold (free up to 100).
  // Rahim gets topped up first so balance is never the limiting factor.
  const boundaries = [
    { amount: 9.99, ok: false, note: 'just below minimum' },
    { amount: 10, ok: true, note: 'exact minimum' },
    { amount: 10.01, ok: true, note: 'just above minimum' },
    { amount: 100, ok: true, note: 'last free amount' },
    { amount: 100.01, ok: true, note: 'first charged amount' },
    { amount: 24999.99, ok: true, note: 'just below maximum' },
    { amount: 25000, ok: true, note: 'exact maximum', knownBug: 'BUG-001' },
    { amount: 25000.01, ok: false, note: 'just above maximum' },
  ];

  for (const b of boundaries) {
    test(`TC-SM-02 BVA amount ${b.amount} (${b.note}) → ${b.ok ? 'accepted' : 'rejected'}`, async ({ rahim, agent }) => {
      if (b.knownBug) {
        test.info().annotations.push({ type: 'issue', description: `${b.knownBug}: docs/bug-reports/${b.knownBug}.md` });
        // Marks the test as "expected to fail" until the defect is fixed.
        // When the fix lands this test will start passing and Playwright will flag it, reminding us to remove this line.
        test.fail();
      }
      expect((await agent.cashIn(R.phone, 25000, A.pin)).status()).toBe(201);
      const before = await rahim.balance();

      const res = await rahim.sendMoney(K.phone, b.amount, R.pin);

      if (b.ok) {
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(body.fee).toBe(sendMoneyFee(b.amount));
        expect(await rahim.balance()).toBeCloseTo(before - b.amount - body.fee, 2);
      } else {
        expect(res.status()).toBe(400);
        expect(await rahim.balance()).toBe(before);
      }
    });
  }

  // Equivalence partitioning: invalid amount types / formats.
  const invalidAmounts: { value: unknown; label: string }[] = [
    { value: 0, label: 'zero' },
    { value: -100, label: 'negative' },
    { value: '500', label: 'numeric string' },
    { value: null, label: 'null' },
    { value: 10.555, label: '3 decimal places' },
  ];
  for (const { value, label } of invalidAmounts) {
    test(`TC-SM-03 rejects ${label} amount`, async ({ rahim }) => {
      const res = await rahim.sendMoney(K.phone, value, R.pin);
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/INVALID_AMOUNT|AMOUNT_BELOW_MIN/);
      expect(await rahim.balance()).toBe(R.balance);
    });
  }

  test('TC-SM-04 insufficient balance is rejected and nothing moves', async ({ rahim, karim }) => {
    // 4996 + 5 fee = 5001 > 5000
    const res = await rahim.sendMoney(K.phone, 4996, R.pin);
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_BALANCE' });
    expect(await rahim.balance()).toBe(R.balance);
    expect(await karim.balance()).toBe(K.balance);
  });

  test('TC-SM-05 sending the entire balance including fee is allowed (balance → 0)', async ({ rahim }) => {
    const res = await rahim.sendMoney(K.phone, 4995, R.pin);
    expect(res.status()).toBe(201);
    expect(await rahim.balance()).toBe(0);
  });

  test('TC-SM-06 cannot send money to yourself', async ({ rahim }) => {
    const res = await rahim.sendMoney(R.phone, 100, R.pin);
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'SELF_TRANSFER' });
  });

  test('TC-SM-07 unregistered receiver returns 404', async ({ rahim }) => {
    const res = await rahim.sendMoney(UNREGISTERED_PHONE, 100, R.pin);
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'RECEIVER_NOT_FOUND' });
  });

  test('TC-SM-08 sending to an agent number is not allowed (must use Cash Out)', async ({ rahim }) => {
    const res = await rahim.sendMoney(A.phone, 100, R.pin);
    expect(res.status()).toBe(404);
  });

  test('TC-SM-09 wrong PIN does not move money', async ({ rahim, karim }) => {
    const res = await rahim.sendMoney(K.phone, 100, '9999');
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'WRONG_PIN' });
    expect(await rahim.balance()).toBe(R.balance);
    expect(await karim.balance()).toBe(K.balance);
  });

  test('TC-SM-10 three wrong transaction PINs lock the account', async ({ rahim }) => {
    await rahim.sendMoney(K.phone, 100, '9999');
    await rahim.sendMoney(K.phone, 100, '9999');
    const third = await rahim.sendMoney(K.phone, 100, '9999');
    expect(third.status()).toBe(423);
    const afterLock = await rahim.sendMoney(K.phone, 100, R.pin);
    expect(afterLock.status()).toBe(423);
  });

  test('TC-SM-11 agent account cannot use Send Money (role check)', async ({ agent }) => {
    const res = await agent.sendMoney(K.phone, 100, A.pin);
    expect(res.status()).toBe(403);
  });

  test('TC-SM-12 transaction appears in both sender and receiver history', async ({ rahim, karim }) => {
    const { trxId } = await (await rahim.sendMoney(K.phone, 250, R.pin)).json();
    const senderHistory = await (await rahim.transactions()).json();
    const receiverHistory = await (await karim.transactions()).json();
    expect(senderHistory[0]).toMatchObject({ trxId, type: 'SEND_MONEY', amount: 250, fee: 5 });
    expect(receiverHistory.map((t: { trxId: string }) => t.trxId)).toContain(trxId);
  });

  test('TC-SM-13 every successful transaction gets a unique TrxID', async ({ rahim }) => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add((await (await rahim.sendMoney(K.phone, 10, R.pin)).json()).trxId);
    }
    expect(ids.size).toBe(10);
  });
});
