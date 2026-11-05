// Database layer for the mock MFS wallet.
// Uses Node's built-in SQLite (node:sqlite), so no native build step is needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'wallet.db');

// The fee account collects every service charge, so money is never created or destroyed.
const FEE_ACCOUNT = '01000000000';

const SEED_ACCOUNTS = [
  { phone: '01711111111', name: 'Rahim Uddin', type: 'customer', pin: '1234', balance: 5000 },
  { phone: '01822222222', name: 'Karim Ahmed', type: 'customer', pin: '5678', balance: 1000 },
  { phone: '01933333333', name: 'Mirpur Agent Point', type: 'agent', pin: '1111', balance: 100000 },
  { phone: FEE_ACCOUNT, name: 'System Fee Account', type: 'system', pin: '0000', balance: 0 },
];

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function resetDb(db) {
  db.exec(`
    DROP TABLE IF EXISTS ledger_entries;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS accounts;

    CREATE TABLE accounts (
      phone        TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL CHECK (type IN ('customer', 'agent', 'system')),
      pin          TEXT NOT NULL,
      balance      REAL NOT NULL CHECK (balance >= 0),
      failed_pins  INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked'))
    );

    CREATE TABLE sessions (
      token      TEXT PRIMARY KEY,
      phone      TEXT NOT NULL REFERENCES accounts(phone),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trx_id      TEXT NOT NULL UNIQUE,
      type        TEXT NOT NULL CHECK (type IN ('CASH_IN', 'SEND_MONEY', 'CASH_OUT')),
      from_phone  TEXT NOT NULL REFERENCES accounts(phone),
      to_phone    TEXT NOT NULL REFERENCES accounts(phone),
      amount      REAL NOT NULL,
      fee         REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'SUCCESS',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Double-entry ledger: every transaction must have total debit = total credit.
    CREATE TABLE ledger_entries (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      trx_id   TEXT NOT NULL REFERENCES transactions(trx_id),
      phone    TEXT NOT NULL REFERENCES accounts(phone),
      debit    REAL NOT NULL DEFAULT 0,
      credit   REAL NOT NULL DEFAULT 0
    );
  `);

  const insert = db.prepare('INSERT INTO accounts (phone, name, type, pin, balance) VALUES (?, ?, ?, ?, ?)');
  for (const a of SEED_ACCOUNTS) insert.run(a.phone, a.name, a.type, a.pin, a.balance);
}

module.exports = { openDb, resetDb, DB_PATH, FEE_ACCOUNT, SEED_ACCOUNTS };
