import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly phone: Locator;
  readonly pin: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.phone = page.getByTestId('login-phone');
    this.pin = page.getByTestId('login-pin');
    this.submit = page.getByTestId('login-submit');
    this.error = page.getByTestId('login-error');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.submit).toBeVisible();
  }

  async login(phone: string, pin: string) {
    await this.phone.fill(phone);
    await this.pin.fill(pin);
    await this.submit.click();
  }
}
