// Mock MFS (Mobile Financial Service) wallet: a small system under test.
// Business rules are documented in docs/BUSINESS_RULES.md.
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { openDb, resetDb, FEE_ACCOUNT } = require('./db');

const RULES = {
  CASH_IN: { min: 50, max: 30000 },
  SEND_MONEY: { min: 10, max: 25000, freeUpTo: 100, flatFee: 5 },
  CASH_OUT: { min: 50, max: 25000, feeRate: 0.0185 },
  MAX_WRONG_PINS: 3,
};

const round2 = (n) => Math.round(n * 100) / 100;

function newTrxId() {
  return 'TRX' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function validateAmount(raw, { min, max }) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must be a number');
  }
  if (round2(raw) !== raw) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Amount can have at most 2 decimal places');
  }
  if (raw < min) throw new ApiError(400, 'AMOUNT_BELOW_MIN', `Minimum amount is ${min} BDT`);
  if (raw > max) throw new ApiError(400, 'AMOUNT_ABOVE_MAX', `Maximum amount is ${max} BDT`);
}

function createApp() {
  const db = openDb();
  if (process.env.RESET_DB_ON_START !== 'false') resetDb(db);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const getAccount = (phone) => db.prepare('SELECT * FROM accounts WHERE phone = ?').get(phone);

  // ---- auth middleware -------------------------------------------------
  function auth(req, _res, next) {
    const header = req.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Missing token'));
    const session = db.prepare('SELECT phone FROM sessions WHERE token = ?').get(token);
    if (!session) return next(new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
    req.user = getAccount(session.phone);
    next();
  }

  // Checks the transaction PIN. Wrong PINs count toward the lockout limit.
  function verifyPin(account, pin) {
    if (account.status === 'locked') throw new ApiError(423, 'ACCOUNT_LOCKED', 'Account is locked');
    if (account.pin !== pin) {
      const failed = account.failed_pins + 1;
      const locked = failed >= RULES.MAX_WRONG_PINS;
      db.prepare('UPDATE accounts SET failed_pins = ?, status = ? WHERE phone = ?')
        .run(failed, locked ? 'locked' : 'active', account.phone);
      if (locked) throw new ApiError(423, 'ACCOUNT_LOCKED', 'Account locked after 3 wrong PIN attempts');
      throw new ApiError(401, 'WRONG_PIN', `Wrong PIN. ${RULES.MAX_WRONG_PINS - failed} attempt(s) left`);
    }
    db.prepare('UPDATE accounts SET failed_pins = 0 WHERE phone = ?').run(account.phone);
  }

  // Moves money atomically and writes balanced ledger entries.
  function transfer({ type, from, to, amount, fee }) {
    const trxId = newTrxId();
    db.exec('BEGIN IMMEDIATE');
    try {
      const sender = getAccount(from);
      if (sender.balance < amount + fee) {
        throw new ApiError(400, 'INSUFFICIENT_BALANCE', 'Insufficient balance');
      }
      db.prepare('UPDATE accounts SET balance = round(balance - ?, 2) WHERE phone = ?').run(amount + fee, from);
      db.prepare('UPDATE accounts SET balance = round(balance + ?, 2) WHERE phone = ?').run(amount, to);
      if (fee > 0) {
        db.prepare('UPDATE accounts SET balance = round(balance + ?, 2) WHERE phone = ?').run(fee, FEE_ACCOUNT);
      }
      db.prepare('INSERT INTO transactions (trx_id, type, from_phone, to_phone, amount, fee) VALUES (?, ?, ?, ?, ?, ?)')
        .run(trxId, type, from, to, amount, fee);
      const entry = db.prepare('INSERT INTO ledger_entries (trx_id, phone, debit, credit) VALUES (?, ?, ?, ?)');
      entry.run(trxId, from, round2(amount + fee), 0);
      entry.run(trxId, to, 0, amount);
      if (fee > 0) entry.run(trxId, FEE_ACCOUNT, 0, fee);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { trxId, type, from, to, amount, fee, balance: getAccount(from).balance };
  }

  function requireCounterparty(phone, expectedType) {
    if (typeof phone !== 'string' || !/^01\d{9}$/.test(phone)) {
      throw new ApiError(400, 'INVALID_PHONE', 'Phone must be 11 digits starting with 01');
    }
    const acc = getAccount(phone);
    if (!acc || acc.type !== expectedType) {
      throw new ApiError(404, 'RECEIVER_NOT_FOUND', `No ${expectedType} account found for ${phone}`);
    }
    if (acc.status === 'locked') throw new ApiError(400, 'RECEIVER_LOCKED', 'Receiver account is locked');
    return acc;
  }

  // ---- routes ----------------------------------------------------------
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/api/login', (req, res, next) => {
    try {
      const { phone, pin } = req.body || {};
      if (typeof phone !== 'string' || !/^01\d{9}$/.test(phone)) {
        throw new ApiError(400, 'INVALID_PHONE', 'Phone must be 11 digits starting with 01');
      }
      if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
        throw new ApiError(400, 'INVALID_PIN_FORMAT', 'PIN must be exactly 4 digits');
      }
      const account = getAccount(phone);
      if (!account || account.type === 'system') {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Phone or PIN is incorrect');
      }
      verifyPin(account, pin);
      const token = crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO sessions (token, phone) VALUES (?, ?)').run(token, phone);
      res.json({ token, name: account.name, type: account.type });
    } catch (e) { next(e); }
  });

  app.post('/api/logout', auth, (req, res) => {
    const token = req.get('Authorization').slice(7);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ message: 'Logged out' });
  });

  app.get('/api/balance', auth, (req, res) => {
    res.json({ phone: req.user.phone, name: req.user.name, balance: req.user.balance });
  });

  // Agent deposits cash into a customer's wallet.
  app.post('/api/cash-in', auth, (req, res, next) => {
    try {
      if (req.user.type !== 'agent') throw new ApiError(403, 'FORBIDDEN', 'Only agents can do cash-in');
      const { customerPhone, amount, pin } = req.body || {};
      validateAmount(amount, RULES.CASH_IN);
      requireCounterparty(customerPhone, 'customer');
      verifyPin(req.user, pin);
      res.status(201).json(transfer({ type: 'CASH_IN', from: req.user.phone, to: customerPhone, amount, fee: 0 }));
    } catch (e) { next(e); }
  });

  // Customer sends money to another customer.
  app.post('/api/send-money', auth, (req, res, next) => {
    try {
      if (req.user.type !== 'customer') throw new ApiError(403, 'FORBIDDEN', 'Only customers can send money');
      const { receiverPhone, amount, pin } = req.body || {};
      const r = RULES.SEND_MONEY;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || round2(amount) !== amount) {
        throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must be a number with at most 2 decimals');
      }
      if (amount < r.min) throw new ApiError(400, 'AMOUNT_BELOW_MIN', `Minimum amount is ${r.min} BDT`);
      // SEEDED DEFECT (BUG-001): should be `amount > r.max`. See docs/bug-reports/BUG-001.md
      if (amount >= r.max) throw new ApiError(400, 'AMOUNT_ABOVE_MAX', `Maximum amount is ${r.max} BDT`);
      if (receiverPhone === req.user.phone) throw new ApiError(400, 'SELF_TRANSFER', 'Cannot send money to yourself');
      requireCounterparty(receiverPhone, 'customer');
      verifyPin(req.user, pin);
      const fee = amount > r.freeUpTo ? r.flatFee : 0;
      res.status(201).json(transfer({ type: 'SEND_MONEY', from: req.user.phone, to: receiverPhone, amount, fee }));
    } catch (e) { next(e); }
  });

  // Customer withdraws cash at an agent. Fee is 1.85%, rounded to 2 decimals.
  app.post('/api/cash-out', auth, (req, res, next) => {
    try {
      if (req.user.type !== 'customer') throw new ApiError(403, 'FORBIDDEN', 'Only customers can cash out');
      const { agentPhone, amount, pin } = req.body || {};
      validateAmount(amount, RULES.CASH_OUT);
      requireCounterparty(agentPhone, 'agent');
      verifyPin(req.user, pin);
      const fee = round2(amount * RULES.CASH_OUT.feeRate);
      res.status(201).json(transfer({ type: 'CASH_OUT', from: req.user.phone, to: agentPhone, amount, fee }));
    } catch (e) { next(e); }
  });

  app.get('/api/transactions', auth, (req, res) => {
    const rows = db.prepare(
      `SELECT trx_id AS trxId, type, from_phone AS "from", to_phone AS "to", amount, fee, status, created_at AS createdAt
       FROM transactions WHERE from_phone = ? OR to_phone = ? ORDER BY id DESC LIMIT 50`
    ).all(req.user.phone, req.user.phone);
    res.json(rows);
  });

  // Test-only helper so every test starts from the same seed data.
  if (process.env.NODE_ENV === 'test') {
    app.post('/api/test/reset', (_req, res) => { resetDb(db); res.json({ reset: true }); });
  }

  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON', message: 'Malformed JSON body' });
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`MFS Wallet running at http://localhost:${port}`));
}

module.exports = { createApp, RULES };
