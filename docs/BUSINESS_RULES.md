# Business Rules (Requirements under test)

These are the requirements the test suite verifies. Each rule links to the test cases that cover it.

## Accounts

| Phone | Name | Type | PIN | Opening balance |
|---|---|---|---|---|
| 01711111111 | Rahim Uddin | customer | 1234 | 5,000.00 |
| 01822222222 | Karim Ahmed | customer | 5678 | 1,000.00 |
| 01933333333 | Mirpur Agent Point | agent | 1111 | 100,000.00 |
| 01000000000 | System Fee Account | system | n/a | 0.00 |

## Rules

| ID | Rule | Covered by |
|---|---|---|
| BR-01 | Phone must be 11 digits starting with `01`. PIN must be exactly 4 digits. | TC-AUTH-02, 03, TC-UI-03 |
| BR-02 | Login errors for unknown numbers must not reveal whether the number exists. | TC-AUTH-04 |
| BR-03 | 3 wrong PINs in a row (login or transaction) lock the account. A correct PIN resets the counter. | TC-AUTH-05, 06, 07, TC-SM-10 |
| BR-04 | All wallet endpoints need a valid session token. Logout invalidates the token. | TC-AUTH-09, 10, 11, TC-UI-04, 10 |
| BR-05 | Amounts must be numbers with at most 2 decimal places and greater than 0. | TC-SM-03 |
| BR-06 | **Cash In** (agent → customer): 50 to 30,000 BDT, no fee. Only agents can do it. | TC-CI-01 to 04 |
| BR-07 | **Send Money** (customer → customer): 10 to 25,000 BDT (both inclusive). Free up to 100 BDT, then a flat 5 BDT fee. Only customers can do it. No self-transfer. | TC-SM-01 to 13, TC-UI-05, 06 |
| BR-08 | **Cash Out** (customer → agent): 50 to 25,000 BDT. Fee is 1.85% rounded to 2 decimals. The agent receives the amount; the fee goes to the system fee account. | TC-CO-01 to 06, TC-UI-07 |
| BR-09 | The sender's balance must cover amount + fee. Balances can never go negative. | TC-SM-04, 05, TC-CO-02, 03, TC-DB-07 |
| BR-10 | Every transaction is atomic and recorded in a double-entry ledger (debits = credits). Failed transactions leave no trace. Money is never created or destroyed. | TC-DB-01 to 06 |
| BR-11 | Every transaction gets a unique TrxID (`TRX` + 10 hex characters). | TC-SM-01, 13 |
| BR-12 | PINs are never returned by any API. | TC-DB-08 |
