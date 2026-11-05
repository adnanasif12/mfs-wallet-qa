import { test, expect } from '../support/fixtures';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage, formatTaka } from '../pages/DashboardPage';
import { ACCOUNTS } from '../support/test-data';

const { rahim: R, karim: K, agent: A } = ACCOUNTS;

test.describe('Login screen', () => {
  test('TC-UI-01 customer logs in and sees name and balance @smoke', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(R.phone, R.pin);
    await new DashboardPage(page).expectLoaded(R.name, R.balance);
  });

  test('TC-UI-02 wrong PIN shows an error and stays on login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(R.phone, '0000');
    await expect(login.error).toHaveText(/Wrong PIN\. 2 attempt\(s\) left/);
    await expect(page).toHaveURL(/\/$/);
  });

  test('TC-UI-03 invalid phone format shows validation message', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('0171', R.pin);
    await expect(login.error).toHaveText('Phone must be 11 digits starting with 01');
  });

  test('TC-UI-04 opening the dashboard without logging in redirects to login', async ({ page }) => {
    await page.goto('/dashboard.html');
    await expect(page).toHaveURL(/\/$/);
    await expect(new LoginPage(page).submit).toBeVisible();
  });
});

test.describe('Dashboard flows', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(R.phone, R.pin);
    dashboard = new DashboardPage(page);
    await dashboard.expectLoaded(R.name, R.balance);
  });

  test('TC-UI-05 send money updates balance, shows TrxID and adds a history row @smoke', async () => {
    const msg = await dashboard.sendMoney(K.phone, '500', R.pin);
    await expect(msg).toHaveText(/Successful\. TrxID: TRX[0-9A-F]{10}\. Fee: ৳ 5\.00/);
    await expect(dashboard.balance).toHaveText(formatTaka(R.balance - 505));
    await expect(dashboard.trxRows).toHaveCount(1);
    await expect(dashboard.trxRows.first()).toContainText('SEND_MONEY');
    await expect(dashboard.trxRows.first()).toContainText(K.phone);
  });

  test('TC-UI-06 send money with insufficient balance shows error and balance is unchanged', async () => {
    const msg = await dashboard.sendMoney(K.phone, '6000', R.pin);
    await expect(msg).toHaveText('Insufficient balance');
    await expect(msg).toHaveClass(/err/);
    await expect(dashboard.balance).toHaveText(formatTaka(R.balance));
    await expect(dashboard.trxRows).toHaveCount(0);
  });

  test('TC-UI-07 cash out shows the 1.85% fee', async () => {
    const msg = await dashboard.cashOut(A.phone, '1000', R.pin);
    await expect(msg).toHaveText(/Fee: ৳ 18\.50/);
    await expect(dashboard.balance).toHaveText(formatTaka(R.balance - 1018.5));
  });

  test('TC-UI-08 form fields are cleared after a successful transaction', async ({ page }) => {
    await dashboard.sendMoney(K.phone, '50', R.pin);
    await expect(page.getByTestId('send-message')).toHaveClass(/ok/);
    await expect(page.getByTestId('send-receiver')).toHaveValue('');
    await expect(page.getByTestId('send-amount')).toHaveValue('');
    await expect(page.getByTestId('send-pin')).toHaveValue('');
  });

  test('TC-UI-09 PIN field is masked', async ({ page }) => {
    await expect(page.getByTestId('send-pin')).toHaveAttribute('type', 'password');
    await expect(page.getByTestId('cashout-pin')).toHaveAttribute('type', 'password');
  });

  test('TC-UI-11 page has no horizontal scroll after a transaction (responsive layout)', async ({ page }) => {
    await dashboard.sendMoney(K.phone, '500', R.pin);
    await expect(dashboard.trxRows).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
  });

  test('TC-UI-10 logout returns to login and back button cannot reopen the dashboard', async ({ page }) => {
    await dashboard.logout();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/dashboard.html');
    await expect(page).toHaveURL(/\/$/);
  });
});
