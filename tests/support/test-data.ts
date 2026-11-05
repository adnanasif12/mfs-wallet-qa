// Seed accounts. Must match app/db.js.
export const ACCOUNTS = {
  rahim: { phone: '01711111111', pin: '1234', name: 'Rahim Uddin', balance: 5000 },
  karim: { phone: '01822222222', pin: '5678', name: 'Karim Ahmed', balance: 1000 },
  agent: { phone: '01933333333', pin: '1111', name: 'Mirpur Agent Point', balance: 100000 },
} as const;

export const FEE_ACCOUNT = '01000000000';

// Total money in the system at seed time. Every transaction must keep this constant.
export const TOTAL_SYSTEM_MONEY = 5000 + 1000 + 100000 + 0;

export const UNREGISTERED_PHONE = '01599999999';

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const cashOutFee = (amount: number) => round2(amount * 0.0185);
export const sendMoneyFee = (amount: number) => (amount > 100 ? 5 : 0);
