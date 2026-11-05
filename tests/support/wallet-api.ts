import { APIRequestContext, APIResponse, expect } from '@playwright/test';

type Creds = { phone: string; pin: string };

/**
 * Thin API client used by tests. Each method returns the raw APIResponse
 * so tests can assert on status codes and error bodies, not only happy paths.
 */
export class WalletApi {
  constructor(private readonly request: APIRequestContext, private token?: string) {}

  static async loginAs(request: APIRequestContext, creds: Creds): Promise<WalletApi> {
    const res = await request.post('/api/login', { data: creds });
    expect(res.status(), `login as ${creds.phone}`).toBe(200);
    const { token } = await res.json();
    return new WalletApi(request, token);
  }

  private get headers() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  getToken() {
    return this.token;
  }

  login(phone: unknown, pin: unknown): Promise<APIResponse> {
    return this.request.post('/api/login', { data: { phone, pin } });
  }

  logout() {
    return this.request.post('/api/logout', { headers: this.headers });
  }

  balanceRaw() {
    return this.request.get('/api/balance', { headers: this.headers });
  }

  async balance(): Promise<number> {
    const res = await this.balanceRaw();
    expect(res.ok()).toBeTruthy();
    return (await res.json()).balance;
  }

  sendMoney(receiverPhone: unknown, amount: unknown, pin: unknown) {
    return this.request.post('/api/send-money', { headers: this.headers, data: { receiverPhone, amount, pin } });
  }

  cashOut(agentPhone: unknown, amount: unknown, pin: unknown) {
    return this.request.post('/api/cash-out', { headers: this.headers, data: { agentPhone, amount, pin } });
  }

  cashIn(customerPhone: unknown, amount: unknown, pin: unknown) {
    return this.request.post('/api/cash-in', { headers: this.headers, data: { customerPhone, amount, pin } });
  }

  transactions() {
    return this.request.get('/api/transactions', { headers: this.headers });
  }
}
