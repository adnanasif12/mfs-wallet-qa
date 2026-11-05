import { test, expect } from '../support/fixtures';
import { ACCOUNTS, UNREGISTERED_PHONE } from '../support/test-data';

test.describe('Login API', () => {
  test('TC-AUTH-01 valid customer login returns a token @smoke', async ({ anon }) => {
    const res = await anon.login(ACCOUNTS.rahim.phone, ACCOUNTS.rahim.pin);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[a-f0-9]{48}$/);
    expect(body).toMatchObject({ name: ACCOUNTS.rahim.name, type: 'customer' });
  });

  // Equivalence partitioning on the phone field: each row is one invalid class.
  const invalidPhones = [
    { phone: '0171111111', why: '10 digits (one short)' },
    { phone: '017111111111', why: '12 digits (one long)' },
    { phone: '02711111111', why: 'does not start with 01' },
    { phone: '0171111111a', why: 'contains a letter' },
    { phone: '', why: 'empty' },
    { phone: 1711111111, why: 'number instead of string' },
  ];
  for (const { phone, why } of invalidPhones) {
    test(`TC-AUTH-02 rejects phone that is ${why}`, async ({ anon }) => {
      const res = await anon.login(phone, '1234');
      expect(res.status()).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'INVALID_PHONE' });
    });
  }

  for (const pin of ['123', '12345', 'abcd', '']) {
    test(`TC-AUTH-03 rejects badly formatted PIN "${pin}"`, async ({ anon }) => {
      const res = await anon.login(ACCOUNTS.rahim.phone, pin);
      expect(res.status()).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'INVALID_PIN_FORMAT' });
    });
  }

  test('TC-AUTH-04 unregistered number gets a generic error (no user enumeration)', async ({ anon }) => {
    const res = await anon.login(UNREGISTERED_PHONE, '1234');
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_CREDENTIALS' });
  });

  test('TC-AUTH-05 wrong PIN shows remaining attempts', async ({ anon }) => {
    const res = await anon.login(ACCOUNTS.rahim.phone, '0000');
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'WRONG_PIN', message: expect.stringContaining('2 attempt(s) left') });
  });

  test('TC-AUTH-06 account locks after 3 wrong PINs, even the correct PIN is then refused', async ({ anon, db }) => {
    await anon.login(ACCOUNTS.rahim.phone, '0000');
    await anon.login(ACCOUNTS.rahim.phone, '0000');
    const third = await anon.login(ACCOUNTS.rahim.phone, '0000');
    expect(third.status()).toBe(423);

    const correct = await anon.login(ACCOUNTS.rahim.phone, ACCOUNTS.rahim.pin);
    expect(correct.status()).toBe(423);

    const row = db.prepare('SELECT status, failed_pins FROM accounts WHERE phone = ?').get(ACCOUNTS.rahim.phone);
    expect(row).toMatchObject({ status: 'locked', failed_pins: 3 });
  });

  test('TC-AUTH-07 a correct PIN resets the wrong-PIN counter', async ({ anon, db }) => {
    await anon.login(ACCOUNTS.rahim.phone, '0000');
    await anon.login(ACCOUNTS.rahim.phone, '0000');
    expect((await anon.login(ACCOUNTS.rahim.phone, ACCOUNTS.rahim.pin)).status()).toBe(200);
    const row = db.prepare('SELECT failed_pins FROM accounts WHERE phone = ?').get(ACCOUNTS.rahim.phone);
    expect(row).toMatchObject({ failed_pins: 0 });
  });

  test('TC-AUTH-08 malformed JSON body returns 400, not 500', async ({ request }) => {
    const res = await request.post('/api/login', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"phone": "01711111111", "pin": ',
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'BAD_JSON' });
  });
});

test.describe('Session / authorization', () => {
  test('TC-AUTH-09 protected endpoint without token returns 401', async ({ anon }) => {
    const res = await anon.balanceRaw();
    expect(res.status()).toBe(401);
  });

  test('TC-AUTH-10 forged token returns 401', async ({ request }) => {
    const res = await request.get('/api/balance', { headers: { Authorization: 'Bearer ' + 'f'.repeat(48) } });
    expect(res.status()).toBe(401);
  });

  test('TC-AUTH-11 token stops working after logout', async ({ rahim }) => {
    expect((await rahim.balanceRaw()).status()).toBe(200);
    expect((await rahim.logout()).status()).toBe(200);
    expect((await rahim.balanceRaw()).status()).toBe(401);
  });

  test('TC-AUTH-12 unknown API route returns JSON 404', async ({ request }) => {
    const res = await request.get('/api/does-not-exist');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
  });
});
