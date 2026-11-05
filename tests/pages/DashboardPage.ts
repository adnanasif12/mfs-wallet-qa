import { Page, Locator, expect } from '@playwright/test';

export const formatTaka = (n: number) =>
  '৳ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export class DashboardPage {
  readonly welcome: Locator;
  readonly balance: Locator;
  readonly logoutButton: Locator;
  readonly trxRows: Locator;

  constructor(private readonly page: Page) {
    this.welcome = page.getByTestId('welcome-name');
    this.balance = page.getByTestId('balance');
    this.logoutButton = page.getByTestId('logout');
    this.trxRows = page.getByTestId('trx-row');
  }

  async expectLoaded(name: string, balance: number) {
    await expect(this.page).toHaveURL(/\/dashboard\.html$/);
    await expect(this.welcome).toHaveText(`Hi, ${name}`);
    await expect(this.balance).toHaveText(formatTaka(balance));
  }

  async sendMoney(receiver: string, amount: string, pin: string) {
    await this.page.getByTestId('send-receiver').fill(receiver);
    await this.page.getByTestId('send-amount').fill(amount);
    await this.page.getByTestId('send-pin').fill(pin);
    await this.page.getByTestId('send-submit').click();
    return this.page.getByTestId('send-message');
  }

  async cashOut(agent: string, amount: string, pin: string) {
    await this.page.getByTestId('cashout-agent').fill(agent);
    await this.page.getByTestId('cashout-amount').fill(amount);
    await this.page.getByTestId('cashout-pin').fill(pin);
    await this.page.getByTestId('cashout-submit').click();
    return this.page.getByTestId('cashout-message');
  }

  async logout() {
    await this.logoutButton.click();
  }
}
