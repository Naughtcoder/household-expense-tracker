// SMS templates. Every pattern below is built from a real message Alex
// screenshotted on 2026-09-14, except the ones marked GUESS.
//
// Three kinds, and the distinction matters:
//   txn     a real movement of money. Record it.
//   notice  a warning about a FUTURE debit. Never record it.
//   echo    a merchant confirming a payment the bank already told us about.
//           Never record it; the bank message is the source of truth.

export type Direction = 'debit' | 'credit'
export type Kind = 'txn' | 'notice' | 'echo'

export interface Pattern {
  id: string
  bank: string
  kind: Kind
  dir?: Direction
  re: RegExp
  /** Email patterns never reach the phone, so the trigger words do not apply.
   *  'app' is read off a payment app's screen on Sam's Android phone. */
  via?: 'sms' | 'email' | 'app'
  /** The account, for a message that never names one (Pine Labs PlusPay is
   *  always the ExpenseCard card's balance). */
  acct?: string
}

const AMT  = String.raw`(?<amount>[\d,]+(?:\.\d{1,2})?)`
// Indian cards report foreign spend in the original currency, so the currency
// has to be captured rather than assumed.
const RS   = String.raw`(?<currency>Rs\.?|INR|USD|EUR|GBP|AED|SGD)\s?`
// Most Indian banks put the running balance in the same message. Worth taking:
// it is the only thing that tells you whether the tracker saw everything.
const BAL  = String.raw`(?:Avl\.?\s*(?:Bal|BAL|Limit|Lmt)|Aval\s*Bal|Available\s*(?:Balance|limit)|Avbl\s*Limit|New\s*Bal|Bal)\s*:?\s*(?:Rs\.?|INR)?\s*(?<balance>[\d,]+(?:\.\d{1,2})?)`
// Real shapes seen: 12/09/26, 08-09-2026, 14-Sep-2026, 2026-09-14:15:03:08
const DATE = String.raw`(?<date>\d{4}-\d{2}-\d{2}|\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[A-Za-z]{3}\d{2,4}|\d{1,2}-\d{1,2})`
// Banks mask accounts every way imaginable: XX1234, *1111, 817546******5555,
// 123xxxx7655, or plain digits. Only the trailing digits matter to us.
const ACCT = String.raw`(?<acct>\d*[Xx*]*\d{3,6})`

export const PATTERNS: Pattern[] = [
  // ---------- reject first: these match real messages we must NOT record ----------
  // 393 of Alex's 1,207 bank messages are OTPs. Each carries an amount AND a
  // merchant, so without this rule every online card spend gets counted twice.
  { id: 'otp', bank: 'any', kind: 'notice',
    re: /\bOTP is\b|is your (?:One Time|OTP)|One Time [Pp]assword|Do not share OTP/i },
  { id: 'declined', bank: 'any', kind: 'notice',
    re: /\bDeclined\b|txn has failed|has failed due to|unsuccessful/i },
  { id: 'marketing', bank: 'any', kind: 'echo',
    re: /Avail Now|Pre-approved|pre-approved|you are eligible|apply now/i },
  // Texts that mention rupees but are not a payment: a shop's offer, a shop's
  // order receipt, a wallet confirming its own top-up (the bank's debit for
  // it is the record), and UPI notices that repeat a payment already alerted.
  { id: 'shop-offer', bank: 'any', kind: 'echo',
    re: /\bOFFER\b.*cashback|unlock exclusive savings|Visit your nearest|DON'T MISS OUT/i },
  { id: 'shop-receipt', bank: 'any', kind: 'echo',
    re: /Thank you for shopping at|We've received your order/i },
  { id: 'wallet-topup', bank: 'any', kind: 'echo',
    re: /top-up was successful/i },
  { id: 'upi-notice', bank: 'any', kind: 'echo',
    re: /cooling period limit for UPI|Ur 1st UPI Txn of/i },
  // Paying your own card bill moves money between your own accounts. It is
  // not spending, and counting it would double every card purchase.
  { id: 'card-bill-paid', bank: 'any', kind: 'notice',
    re: /PAYMENT OF .*RECEIVED TOWARDS YOUR CREDIT CARD/i },
  { id: 'card-bill-credited', bank: 'any', kind: 'notice',
    re: /Payment of (?:Rs\.?|INR)\s?[\d,.]+\s+(?:vide Ref#\s*\S+\s+)?was credited to your Credit Card/i },
  { id: 'banka-emandate-notice', bank: 'BankA', kind: 'notice',
    re: new RegExp(String.raw`E-Mandate!?\s*${RS}${AMT}\s+will\s+be\s+deducted\s+on\s+${DATE}`, 'i') },
  { id: 'generic-future-debit', bank: 'unknown', kind: 'notice',
    re: new RegExp(String.raw`${RS}${AMT}\s+will\s+be\s+(?:deducted|debited|charged)`, 'i') },
  { id: 'merchant-autopay-echo', bank: 'merchant', kind: 'echo',
    re: new RegExp(String.raw`Bill\s+of\s+${RS}${AMT}\s+is\s+successfully\s+processed`, 'i') },
  { id: 'merchant-upi-echo', bank: 'merchant', kind: 'echo',
    re: new RegExp(String.raw`Payment\s+of\s+${RS}${AMT}\s+done\s+via\s+Upi\s+has\s+been\s+processed`, 'i') },

  // ---------- email look-alikes: amount and payee present, no money moved ----------
  // ExpenseCard refuses a card payment once too many receipts are missing. The email
  // has the same shape as a purchase, so it must be caught before that reader.
  { id: 'expensecard-email-rejected', bank: 'Pine Labs', kind: 'notice', via: 'email',
    re: /Your\s+card\s+transaction\s+of\s+₹\s?[\d,]+(?:\.\d{1,2})?\s+to\s+.+?\s+has\s+been\s+rejected/i },
  // YES sends this after its own NEFT debit alert. Same money, counted once.
  { id: 'yes-email-neft-confirmation', bank: 'Yes Bank', kind: 'echo', via: 'email',
    re: /NEFT\s+Transaction\s+with\s+reference\s+number\s+\S+\s+for\s+INR\s+[\d,]+(?:\.\d{1,2})?\s+has\s+been\s+credited\s+to\s+the\s+beneficiary\s+account/i },
  { id: 'yes-email-otp', bank: 'Yes Bank', kind: 'notice', via: 'email',
    re: /Your\s+Transaction\s+Password\s+is\s+\d{4,8}\b/i },
  // "Your transaction has failed as the daily withdrawal limit was exceeded."
  { id: 'bankb-email-failed', bank: 'BankB', kind: 'notice', via: 'email',
    re: /Your\s+transaction\s+has\s+failed\b/i },
  // A card limit being switched on names an amount, but nothing was spent.
  { id: 'banka-email-limit-change', bank: 'BankA', kind: 'notice', via: 'email',
    re: /transaction\s+limit\s+is\s+currently\s+enabled\s+and\s+is\s+set\s+for/i },

  // ---------- BankA ----------
  { id: 'banka-card-spent', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Spent\s+${RS}${AMT}\s+On\s+BankA\s+Bank\s+Card\s+${ACCT}\s+At\s+(?<merchant>.+?)\s+On\s+${DATE}`, 'i') },
  { id: 'banka-upi-mandate', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`UPI\s+Mandate:\s*Sent\s+${RS}${AMT}\s+from\s+BankA\s+Bank\s+A\/c\s+${ACCT}\s+To\s+(?<merchant>.+?)\s+${DATE}\s+Ref`, 'i') },
  { id: 'banka-upi-sent', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Sent\s+${RS}${AMT}\s+From\s+BankA\s+Bank\s+A\/C\s+${ACCT}\s+To\s+(?<merchant>.+?)\s+On\s+${DATE}`, 'i') },
  { id: 'banka-acct-credit', bank: 'BankA', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+(?:has been\s+)?credited\s+to\s+(?:your\s+)?(?:account|A\/c)\s+${ACCT}\s+(?:from|by)\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },

  // ---------- Payment apps, read off the screen on Sam's phone ----------
  // SBI sends no text for most of her UPI payments, so her Android app reads
  // | 04 October 2026 at 08:38 PM | Alex | +91 ••••• •0001 | ₹5 | Split
  { id: 'phonepe-screen-paid', bank: 'PhonePe', kind: 'txn', dir: 'debit', via: 'app',
    re: new RegExp(String.raw`^\[(?:screen|notification) PhonePe\] Payment Successful \| (?<date>\d{1,2} [A-Za-z]+ \d{4}) at [^|]+\| (?<merchant>[^|]+?) \|(?: [^|₹]*\|)* ₹\s?${AMT}\s*\|`, 'i') },

  // ---------- BankB ----------
  { id: 'bankb-pos-debit', bank: 'BankB', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+BankB\s+Bank\s+a\/c\s*${ACCT}\s+POS\/Ecom\s+txn\s+to\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },

  // ---------- Pine Labs prepaid (the 5555 Amazon Pay card) ----------
  // Two messages arrive per transaction. Both parse; dedupe collapses them.
  { id: 'pinelabs-redeemed', bank: 'Pine Labs', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+has\s+been\s+redeemed\s+from\s+your\s+Card\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  // A UPI payment from the ExpenseCard card's PlusPay balance. Names no card and
  // masks the payee. Real, 8 Oct 2026:
  { id: 'pinelabs-pluspay-upi', bank: 'Pine Labs', kind: 'txn', dir: 'debit', acct: '5555',
    re: new RegExp(String.raw`PlusPay\s+balance\s+debited\s+for\s+${RS}${AMT}\s+on\s+${DATE}\s*;\s*(?<merchant>.+?)\s+credited`, 'i') },
  { id: 'pinelabs-detected', bank: 'Pine Labs', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`We\s+detected\s+a\s+transaction\s+of\s+${RS}${AMT}\s+on\s+your\s+card\s+${ACCT}\s+for\s+(?<merchant>.+?)\s+at\s+${DATE}`, 'i') },

  // The most common single format in his history. Note the year-less date.
  { id: 'banka-amt-sent', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Amt\s+Sent\s+${RS}${AMT}\s+From\s+BankA\s+Bank\s+A\/C\s+${ACCT}\s+To\s+(?<merchant>.+?)\s+On\s+${DATE}\s+Ref`, 'i') },
  { id: 'banka-credit-alert', bank: 'BankA', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`Credit\s+Alert!?\s*${RS}${AMT}\s+credited\s+to\s+BankA\s+Bank\s+A\/c\s+${ACCT}\s+on\s+${DATE}\s+from\s+(?:VPA\s+)?(?<merchant>\S+)`, 'i') },

  { id: 'banka-upcoming-mandate', bank: 'BankA', kind: 'notice',
    re: /Upcoming\s+mandate\s+set\s+for/i },

  { id: 'banka-vpa-credit', bank: 'BankA', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+credited\s+to\s+a\/c\s+${ACCT}\s+on\s+${DATE}\s+by\s+a\/c\s+linked\s+to\s+VPA\s+(?<merchant>\S+)`, 'i') },
  { id: 'banka-acct-transfer', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+from\s+a\/c\s+${ACCT}\s+on\s+${DATE}\s+to\s+(?<merchant>a\/c\s+\S+)`, 'i') },

  // ---------- Yes Bank, account 8727 ----------
  { id: 'yes-upi-credit', bank: 'Yes Bank', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+credited\s+to\s+YES\s+BANK\s+Ac\s+${ACCT}\s+on\s+${DATE}[\s\d:]*\.?\s*UPI:\d+\/From:(?<merchant>\S+)`, 'i') },
  { id: 'yes-interest', bank: 'Yes Bank', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+credited\s+to\s+A\/c\s+${ACCT}\s+towards\s+(?<merchant>Credit\s+Interest[A-Za-z ]*)`, 'i') },
  { id: 'yes-debited', bank: 'Yes Bank', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`YES\s+BANK\s+Ac\s+${ACCT}\s+debited\s+for\s+${RS}${AMT}\s+on\s+${DATE}[\s\d:]*\.?\s*UPI:\d+\/To:(?<merchant>\S+)`, 'i') },
  { id: 'yes-credited', bank: 'Yes Bank', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+is\s+credited\s+to\s+YES\s+BANK\s+Acc\s+${ACCT}\s+on\s+${DATE}[\s\d:]*-\s*(?<merchant>\S+)`, 'i') },

  { id: 'banka-deposited', bank: 'BankA', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+deposited\s+in\s+BankA\s+Bank\s+A\/c\s+${ACCT}\s+on\s+${DATE}\s+for\s+(?<merchant>[^.]+?)\.`, 'i') },

  { id: 'bankb-upi-credit', bank: 'BankB', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`${RS}${AMT}\s+credited\s+to\s+your\s+BankB\s+Bank\s+a\/c\s*${ACCT}\s+from\s+(?<merchant>\S+)`, 'i') },

  // ---------- BankA, older and alternate wordings found in chat.db ----------
  { id: 'banka-alert-spent', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`You've\s+spent\s+${RS}${AMT}\s+(?:on|via)\s+(?:CREDIT|DEBIT|Debit|Credit)\s+Card\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'banka-atm-withdrawn', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`You've\s+withdrawn\s+${RS}${AMT}\s+via\s+Debit\s+Card\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'banka-card-spent-lower', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+on\s+BankA\s+Bank\s+Card\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'banka-acct-to-acct', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+from\s+BankA\s+Bank\s+A\/c\s+${ACCT}\s+on\s+(?<date>\d{1,2}-\d{1,2})\s+to\s+(?<merchant>A\/c\s+\S+)`, 'i') },

  // ---------- BankB, the three real wordings ----------
  { id: 'bankb-alert-debited', bank: 'BankB', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`BankB\s+Bank\s+Alert\s*-\s*A\/c\s+no\.?\s*${ACCT}\s+is\s+debited\s+by\s+${RS}${AMT}\s+on\s+account\s+of\s+(?<merchant>[A-Za-z /]+?)\.\s*Avail\s+Bal[^]*?\s+on\s+${DATE}`, 'i') },
  { id: 'bankb-pos-nomerchant', bank: 'BankB', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+BankB\s+Bank\s+a\/c\s*${ACCT}\s+on\s+account\s+of\s+(?<merchant>[A-Za-z /]+?)\s+on\s+${DATE}`, 'i') },
  { id: 'bankb-credited', bank: 'BankB', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`BankB\s+A\/c\s+no\.?\s*${ACCT}\s+has\s+been\s+credited\s+with\s+${RS}${AMT}\s+from\s+(?<merchant>.+?)(?:\s+on\s+${DATE}|\.|$)`, 'i') },

  // ---------- ICICI ----------
  { id: 'icici-card-spent', bank: 'ICICI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+using\s+ICICI\s+Bank\s+Card\s+${ACCT}\s+on\s+${DATE}\s+on\s+(?<merchant>.+?)\s*(?:\.|,|$)`, 'i') },
  { id: 'icici-autopay-done', bank: 'ICICI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`account\s+has\s+been\s+debited\s+with\s+${RS}${AMT}\s+towards\s+(?<merchant>.+?)\s+for\s+AutoPay`, 'i') },
  { id: 'icici-autopay-future', bank: 'ICICI', kind: 'notice',
    re: /account\s+will\s+be\s+debited\s+with/i },

  // ---------- Axis ----------
  { id: 'axis-card-spent-2', bank: 'Axis', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Spent\s+${RS}${AMT}\s+Axis\s+Bank\s+Card\s+no\.?\s*${ACCT}\s+${DATE}[\d:\sA-Z]*?\s(?<merchant>[A-Za-z][^\n]*?)\s+Avl\s+(?:Limit|Lmt)`, 'i') },

  // ---------- Kotak ----------
  { id: 'kotak-acct-debit', bank: 'Kotak', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+from\s+your\s+Kotak\s+Bank\s+AC\s+${ACCT}\s+on\s+${DATE}`, 'i') },
  { id: 'kotak-card-spent-2', bank: 'Kotak', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+on\s+Kotak\s+Credit\s+Card\s+${ACCT}\s+on\s+${DATE}\s+at\s+(?<merchant>.+?)\.\s*Avl`, 'i') },
  { id: 'kotak-sent-masked', bank: 'Kotak', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Sent\s+${RS}${AMT}\s+from\s+${ACCT}\s+to\s+(?<merchant>.+?)\s+on\s+${DATE}\.\s*UPI\s+ref`, 'i') },

  // ---------- SBI ----------
  { id: 'sbi-debitcard', bank: 'SBI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`for\s+${RS}${AMT}\s+by\s+SBI\s+Debit\s+Card\s+${ACCT}\s+done\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'sbi-acct-debit', bank: 'SBI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+from\s+A\/c\s+${ACCT}\s+on\s+${DATE}\.\s*Avl`, 'i') },
  { id: 'sbi-creditcard-at', bank: 'SBI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+on\s+your\s+SBI\s+Credit\s+Card\s+ending\s+(?:with\s+)?${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'sbi-creditcard-on', bank: 'SBI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+on\s+your\s+SBI\s+Credit\s+Card\s+ending\s+(?:with\s+)?${ACCT}\s+on\s+${DATE}`, 'i') },
  { id: 'sbi-card-bill-paid', bank: 'SBI', kind: 'notice',
    re: /payment of .* has been credited to your SBI Credit Card/i },

  // ---------- IndusInd ----------
  { id: 'indus-acct-debit-vpa', bank: 'IndusInd', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`A\/c\s*\*?${ACCT}\s+debited\s+by\s+${RS}${AMT}\s+towards\s+(?<merchant>\S+)`, 'i') },
  { id: 'indus-acct-credit-vpa', bank: 'IndusInd', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`A\/C\s*\*?${ACCT}\s+credited\s+by\s+${RS}${AMT}\s+from\s+(?<merchant>\S+)`, 'i') },
  { id: 'indus-debited-at', bank: 'IndusInd', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+from\s+A\/c\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+Ref`, 'i') },

  // ---------- IDFC First ----------
  { id: 'idfc-card-spent', bank: 'IDFC First', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+on\s+your\s+IDFC\s+FIRST\s+Bank\s+Credit\s+Card\s+ending\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'idfc-acct-debit', bank: 'IDFC First', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`A\/[Cc]\s+${ACCT}\s+is\s+debited\s+by\s+${RS}${AMT}\s+on\s+${DATE}`, 'i') },
  { id: 'idfc-acct-credit', bank: 'IDFC First', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`A\/[Cc]\s+${ACCT}\s+is\s+credited\s+by\s+${RS}${AMT}\s+on\s+${DATE}`, 'i') },
  { id: 'idfc-debited-merchant', bank: 'IDFC First', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`A\/c\s+${ACCT}\s+debited\s+by\s+${RS}${AMT}\s+on\s+${DATE};\s*(?<merchant>.+?)\s+credited`, 'i') },

  // ---------- Federal ----------
  { id: 'federal-upi-debit', bank: 'Federal', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+via\s+UPI\s+on\s+${DATE}[\d:\s]*to\s+VPA\s+(?<merchant>[^.\s]+)`, 'i') },

  // ---------- PNB ----------
  { id: 'pnb-debit', bank: 'PNB', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`A\/?c\s+${ACCT}\s+Debited\s+with\s+${RS}${AMT}[,\s]+${DATE}`, 'i') },
  { id: 'pnb-credit', bank: 'PNB', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`A\/?c\s+${ACCT}\s+Credited\s+with\s+${RS}${AMT}[,\s]+${DATE}`, 'i') },

  // ---------- Standard Chartered ----------
  { id: 'scb-acct-debit', bank: 'StanChart', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`a\/c\s+${ACCT}\s+is\s+debited\s+for\s+${RS}${AMT}\s+on\s+${DATE}`, 'i') },
  { id: 'scb-transfer-credit', bank: 'StanChart', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`there\s+is\s+an?\s+(?<merchant>NEFT|RTGS|IMPS)\s+credit\s+of\s+${RS}${AMT}\s+in\s+your\s+account\s+${ACCT}\s+on\s+${DATE}`, 'i') },

  // ---------- Yes Bank card ----------
  { id: 'yes-card-spent', bank: 'Yes Bank', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+on\s+YES\s+BANK\s+Card\s+${ACCT}\s+@(?<merchant>.+?)\s+${DATE}`, 'i') },

  // ---------- Canara ----------
  { id: 'canara-credit', bank: 'Canara', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`amount\s+of\s+${RS}${AMT}\s+has\s+been\s+credited\s+to\s+${ACCT}\s+on\s+${DATE}\s+towards\s+(?<merchant>[A-Za-z]+)`, 'i') },

  // ---------- Jupiter / CSB ----------
  { id: 'csb-card-debit', bank: 'Jupiter', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+to\s+your\s+Edge\s+CSB\s+Bank\s+RuPay\s+Credit\s+Card\s+ending\s+${ACCT}\s+on\s+${DATE}`, 'i') },

  // ---------- BankA, more ----------
  { id: 'banka-reversed', bank: 'BankA', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`Transaction\s+Reversed!?\s*On\s+BankA\s+Bank\s+\w+\s+Card\s+${ACCT}\s+Amt:\s*${RS}${AMT}\s+By\s+(?<merchant>.+?)\s+On\s+${DATE}`, 'i') },
  { id: 'banka-upi-to-vpa', bank: 'BankA', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+debited\s+from\s+A\/c\s+${ACCT}\s+on\s+${DATE}\s+to\s+(?<merchant>[^\s(]+)`, 'i') },
  { id: 'banka-bill-alert', bank: 'BankA', kind: 'notice',
    re: /New Bill Alert|Refund initiated/i },

  // ---------- GUESS: not yet seen from Alex, standard templates ----------
  { id: 'sbi-upi-debit', bank: 'SBI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`A\/C\s+${ACCT}\s+debited\s+by\s+${AMT}\s+on\s+date\s+${DATE}\s+trf\s+to\s+(?<merchant>.+?)\s+Refno`, 'i') },
  { id: 'sbi-card-spent', bank: 'SBI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+spent\s+(?:using|on)\s+SBI\s+Card\s+${ACCT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'icici-acct-debit', bank: 'ICICI', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`ICICI\s+Bank\s+Acc?t?\s+${ACCT}\s+debited\s+for\s+${RS}${AMT}\s+on\s+${DATE}[;,\s]+(?<merchant>.+?)\s+credited`, 'i') },
  { id: 'axis-card-spent', bank: 'Axis', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Spent\s+Card\s+no\.?\s+${ACCT}\s+INR\s+${AMT}\s+${DATE}[\s\d:]*(?<merchant>.+?)\s+Avl\s+Lmt`, 'i') },
  { id: 'kotak-upi-sent', bank: 'Kotak', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Sent\s+${RS}${AMT}\s+from\s+Kotak\s+Bank\s+AC\s+${ACCT}\s+to\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },

  // ---------- ExpenseCard emails (card 5555) ----------
  // ExpenseCard emails every purchase and every refund to alex@example.com. The
  // phone missed one purchase in nineteen and every refund, so these emails,
  // not the SMS, are what makes the card complete. The text is the email with
  // its HTML stripped, so the hidden preview line comes first.
  { id: 'expensecard-email-spent', bank: 'Pine Labs', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`Your\s+card\s+transaction\s+of\s+₹\s?${AMT}\s+to\s+(?<merchant>.+?)\s+is\s+successful[\s\S]*?Payment\s+Date:\s*(?<date>\d{1,2}\s+[A-Za-z]{3}\s+\d{4})[\s\S]*?X{4}-X{4}-X{4}-(?<acct>\d{4})`, 'i') },
  // A refund names the purchase it reverses, so the app can file it against
  // that purchase: same card, same scope, same category.
  { id: 'expensecard-email-refund', bank: 'Pine Labs', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`A\s+refund\s+of\s+amount\s+₹\s?${AMT}\s+from\s+(?<merchant>.+?)\s+has\s+been\s+processed[\s\S]*?Refund\s+Date:\s*(?<date>\d{1,2}\s+[A-Za-z]{3}\s+\d{4})[\s\S]*?Payment\s+Date:\s*(?<origdate>\d{1,2}\s+[A-Za-z]{3}\s+\d{4})[\s\S]*?Original\s+Payment\s+Amount:\s*(?<orig>[\d,]+(?:\.\d{1,2})?)`, 'i') },

  // ---------- BankA emails (alerts@banka.bank.in to user@example.com) ----------
  // BankA emails every payment, including the ones the phone dropped. The
  // payee name in brackets is the one the payer app shows, so it is used.
  { id: 'banka-email-notice', bank: 'BankA', kind: 'notice', via: 'email',
    re: /upcoming E-mandate|request your consent via OTP|AutoPay payment for .* was declined/i },
  { id: 'banka-email-upi-debit', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+is\s+debited\s+from\s+your\s+account\s+ending\s+${ACCT}\s+towards\s+VPA\s+\S+\s+\((?<merchant>[^)]+)\)\s+on\s+${DATE}`, 'i') },
  // The older UPI email (alerts@banka.net, to March 2026) puts the payee
  // name after the VPA: "to VPA billdeskpg.appleservices@banka Apple
  // Services on 20-03-26". The name is taken; a bare VPA is kept as it is.
  { id: 'banka-email-vpa-debit', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+has\s+been\s+debited\s+from\s+account\s+${ACCT}\s+to\s+VPA\s+(?:\S+@\S+\s+)?(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'banka-email-account-debit', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+has\s+been\s+debited\s+from\s+account\s+${ACCT}\s+to\s+(?:VPA\s+)?(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  { id: 'banka-email-card-debit', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+has\s+been\s+debited\s+from\s+your\s+BankA\s+Bank\s+Credit\s+Card\s+ending\s+${ACCT}\s+towards\s+(?<merchant>.+?)\s+on\s+(?<date>\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})`, 'i') },
  { id: 'banka-email-upi-credit', bank: 'BankA', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+has\s+been\s+successfully\s+credited\s+to\s+your\s+BankA\s+Bank\s+account\s+ending\s+in\s+${ACCT}\.?[\s\S]*?Date:\s*${DATE}[\s\S]*?Sender:\s*(?<merchant>.+?)\s+\(VPA`, 'i') },
  // NetBanking payments carry no date in the body. The app appends the date
  // the email was sent, which is the day the payment was made.
  { id: 'banka-email-netbanking', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`Payment\s+Details\s+Amount:\s*${RS}${AMT}\s+From\s+Account:\s*\**(?<acct>\d{4})\s+Paid\s+To:\s*(?<merchant>.+?)\s+Important[\s\S]*?\[sent\s+(?<date>\d{2}-\d{2}-\d{4})\]`, 'i') },
  // A reversal gives money back on a card, so it is filed like a refund.
  { id: 'banka-email-card-reversal', bank: 'BankA', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`transaction\s+reversal\s+of\s+${RS}${AMT}\s+has\s+been\s+initiated\s+to\s+your\s+BankA\s+Bank\s+Credit\s+Card\s+ending\s+${ACCT}\s+From\s+Merchant:\s*(?<merchant>.+?)\s+Date\s+Time:\s*(?<date>\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})`, 'i') },
  { id: 'banka-email-card-is-debited', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+is\s+debited\s+from\s+your\s+BankA\s+Bank\s+Credit\s+Card\s+ending\s+${ACCT}\s+towards\s+(?<merchant>.+?)\s+on\s+(?<date>\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})`, 'i') },
  { id: 'banka-email-card-made', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`BankA\s+Bank\s+Credit\s+Card\s+ending\s+in\s+${ACCT}\s*\.\s*You\s+made\s+a\s+transaction\s+of\s+${RS}${AMT}\s+at\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
  // The older reversal email has a full stop after the card number and a
  // stray "A" glued to the colon ("From Merchant:A ZEPTO"), left over from a
  // non-breaking space. The "A" is dropped only when it touches the colon.
  { id: 'banka-email-card-reversal-old', bank: 'BankA', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`Transaction\s+reversal\s+of\s+${RS}${AMT}\s+has\s+been\s+initiated\s+to\s+your\s+BankA\s+Bank\s+Credit\s+Card\s+ending\s+${ACCT}\.\s*From\s+Merchant:(?:[AÂ]\s+|\s*)(?<merchant>.+?)\s+Date\s+Time:\s*(?<date>\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})`, 'i') },
  { id: 'banka-email-vpa-credit', bank: 'BankA', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`${RS}${AMT}\s+is\s+successfully\s+credited\s+to\s+your\s+account\s+${ACCT}\s+by\s+VPA\s+(?:\S+@\S+\s+)?(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },

  // ---------- YES Bank emails (alerts@yes.bank.in, account 8727) ----------
  { id: 'yes-email-upi-debit', bank: 'Yes Bank', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+${RS}${AMT}\s+has\s+been\s+debited\s+to\s+your\s+A\/C\.?\s+No\.?\s+${ACCT}\s+on\s+${DATE}[-\s\d:]*?\s*on\s+account\s+of\s+UPI:\d+\/To:(?<merchant>\S+?)\.?\s+Available\s+Balance`, 'i') },
  { id: 'yes-email-imps-debit', bank: 'Yes Bank', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+${RS}${AMT}\s+has\s+been\s+debited\s+to\s+your\s+A\/C\.?\s+No\.?\s+${ACCT}\s+on\s+${DATE}[-\s\d:]*?\s*on\s+account\s+of\s+IMPS:\d+\/(?<merchant>.+?)\.?\s+Available\s+Balance`, 'i') },
  { id: 'yes-email-neft-debit', bank: 'Yes Bank', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+${RS}${AMT}\s+has\s+been\s+debited\s+to\s+your\s+A\/C\.?\s+No\.?\s+${ACCT}\s+on\s+${DATE}[-\s\d:]*?\s*on\s+account\s+of\s+NEFT:[A-Z0-9]+\/(?<merchant>.+?)\.?\s+Available\s+Balance`, 'i') },
  { id: 'yes-email-upi-credit', bank: 'Yes Bank', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+${RS}${AMT}\s+has\s+been\s+credited\s+to\s+your\s+A\/C\.?\s+No\.?\s+${ACCT}\s+on\s+${DATE}[-\s\d:]*?\s*on\s+account\s+of\s+UPI:\d+\/From:(?<merchant>\S+?)\.?\s+Available\s+Balance`, 'i') },
  { id: 'yes-email-interest', bank: 'Yes Bank', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+${RS}${AMT}\s+has\s+been\s+credited\s+to\s+your\s+A\/C\.?\s+No\.?\s+${ACCT}\s+on\s+${DATE}[-\s\d:]*?\s*on\s+account\s+of\s+(?<merchant>Credit\s+Interest\s+Capitalised)`, 'i') },

  // ---------- ICICI emails (customernotification@icici.bank.in, account 266) ----------
  // source; the account prefix and the interest period are dropped.
  { id: 'icici-email-credit', bank: 'ICICI', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`ICICI\s+Bank\s+Account\s+${ACCT}\s+has\s+been\s+credited\s+with\s+${RS}${AMT}\s+on\s+${DATE}\.\s*Info:\s*(?:XX\d+:)?(?<merchant>.+?)(?::\d{2}-\d{2}-\d{4}\s+to\s+\d{2}-\d{2}-\d{4})?\.\s`, 'i') },

  // ---------- SBI emails (cbsalerts.sbi@alerts.sbi.co.in) ----------
  // The body has no date, so the day the email was sent is used.
  { id: 'sbi-email-tds', bank: 'SBI', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`(?<merchant>TDS)\s+of\s+${RS}${AMT}\s+deducted\s+for\s+interest\s+paid\s+on\s+A\/C\s+No\s+${ACCT}[\s\S]*?\[sent\s+(?<date>\d{2}-\d{2}-\d{4})\]`, 'i') },

  // ---------- BankB emails (alerts@bankbbank.com to the personal inbox, 2024 to 2025) ----------
  // Each body opens with a long disclaimer; the payment sentence follows it.
  { id: 'bankb-email-card', bank: 'BankB', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`Your\s+BankB\s+Account\s+Number\s+${ACCT}\s+was\s+debited\s+with\s+INR\s+${AMT}\s+on\s+(?<date>\d{2}-\d{2}-\d{4})\s+[\d:]+\s+[AP]M\s+IST\s+at\s+(?:VS\/\d+\/[\d:]+\/)?(?<merchant>.+?)\s+\.\s+Available`, 'i') },
  { id: 'bankb-email-debit', bank: 'BankB', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`Your\s+account\s+number\s+${ACCT}\s+is\s+debited\s+by\s+INR\s+${AMT}\s+on\s+(?<date>\d{2}-\d{2}-\d{4})\s+[\d:]+\s+[AP]M\s+IST\s*(?:on\s+account\s+of\s+(?<merchant>[^.]+?))?\s*\.\s+Available`, 'i') },
  { id: 'bankb-email-credit', bank: 'BankB', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`Your\s+account\s+number\s+${ACCT}\s+is\s+credited\s+by\s+INR\s+${AMT}\s+on\s+(?<date>\d{2}-\d{2}-\d{4})\s+[\d:]+\s+[AP]M\s+IST\s*(?:on\s+account\s+of\s+(?<merchant>[^.]+?))?\s*\.\s+Available`, 'i') },

  // ---------- Canara Bank (Sam's NRI account), seen in her survey 3 Oct 2026 ----------
  { id: 'canara-email-credit', bank: 'Canara', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+INR\s+${AMT}\s+has\s+been\s+CREDITED\s+to\s+your\s+account\s+X*(?<acct>\d{3,4})\s+on\s+(?<date>\d{2}\/\d{2}\/\d{4})(?:\s+towards\s+(?<merchant>[^.]+?))?\s*\.`, 'i') },
  { id: 'canara-email-debit', bank: 'Canara', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`An\s+amount\s+of\s+INR\s+${AMT}\s+has\s+been\s+DEBITED\s+from\s+your\s+account\s+X*(?<acct>\d{3,4})\s+on\s+(?<date>\d{2}\/\d{2}\/\d{4})(?:\s+towards\s+(?<merchant>[^.]+?))?\s*\.`, 'i') },

  // ---------- Sam's phone texts, learned from her history on 3 Oct 2026 ----------
  // BankC puts no year on the date and cuts the payee to seven letters:
  { id: 'bankc-sms-debit', bank: 'BankC', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`BankCSFB\s+A\/c\s+X(?<acct>\d{3,4})\s+debited\s+Rs\.?\s*${AMT}\s+on\s+(?<date>\d{1,2}[A-Za-z]{3})\s*\d{1,2}:\d{2}\s+for\s+(?:UPI\s*)?(?:(?<merchant>\S.*?)\s+)?Ref\s+\d+`, 'i') },
  { id: 'bankc-sms-credit', bank: 'BankC', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`BankCSFB\s+A\/c\s+X(?<acct>\d{3,4})\s+credited\s+Rs\.?\s*${AMT}\s+on\s+(?<date>\d{1,2}[A-Za-z]{3})\s*\d{1,2}:\d{2}\s+towards\s+[^.]*?\.?\s*Ref\s+\S+?(?:\s+from\s+(?:(?<merchant>.+?)\s+)?X[\w\/]*)?\s*\.?\s+Avl`, 'i') },
  { id: 'bankc-sms-charge', bank: 'BankC', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`Rs\.?\s*${AMT}\s+debited\s+from\s+A\/C\s+X*(?<acct>\d{3,4})\s+on\s+(?<date>\d{2}-\d{2}-\d{4})\s+at\s+[\d:]+\s+at\s+(?<merchant>Branch\s+\w+)`, 'i') },
  { id: 'bankc-sms-autopay', bank: 'BankC', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`successfully\s+debited\s+with\s+₹\s*${AMT}\s+on\s+(?<date>\d{2}\/\d{2}\/\d{4})\s+towards\s+(?<merchant>\S+)\s+UPI\s+AutoPay`, 'i') },
  // Cash out is not spending; the cash is logged when it is spent.
  { id: 'bankc-sms-atm', bank: 'BankC', kind: 'notice',
    re: /You've\s+withdrawn\s+Rs\.?\s*[\d,.]+\s+on\s+BankC\s+Bank\s+Debit\s+card/i },
  { id: 'bankc-sms-mandate', bank: 'BankC', kind: 'notice',
    re: /UPI\s+AutoPay\s+Mandate\s+.*successfully\s+created/i },
  { id: 'sbi-sms-neft-credit', bank: 'SBI', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`INR\s+${AMT}\s+credited\s+to\s+your\s+A\/c\s+No\s+X*(?<acct>\d{3,4})\s+on\s+(?<date>\d{2}\/\d{2}\/\d{4})\s+through\s+\w+\s+with\s+UTR\s+\S+\s+by\s+(?<merchant>[^,]+)`, 'i') },
  { id: 'sbi-sms-deposit-credit', bank: 'SBI', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`A\/C\s+X*\d*?(?<acct>\d{4})\s+Credited\s+INR\s+${AMT}\s+on\s+(?<date>\d{2}\/\d{2}\/\d{2,4})\s*-?\s*(?:Deposit\s+by\s+transfer\s+from\s+)?(?<merchant>.+?)\.\s+Avl`, 'i') },
  { id: 'sbi-email-neft-credit', bank: 'SBI', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`Credited\s+to\s+Your\s+A\/c:?\s*X*(?<acct>\d{3,4})\s+Amount:?\s*INR\s+${AMT}\s+UTR\s+No\.?:?\s*\S+\s+Date:?\s*(?<date>\d{2}\/\d{2}\/\d{4})\s+Sent\s+by:?\s*(?<merchant>.+?)(?:\s+Sender\s+Bank|$)`, 'i') },
  // ---------- Sam's overseas cards (SGD; stored in rupees at the day's rate) ----------
  { id: 'dbs-email-card', bank: 'DBS', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`transaction\s+request\s+dated\s+(?<date>\d{2}\/\d{2}\/\d{2})[\s\S]*?Amount:\s*(?<currency>SGD|USD|INR|EUR)\s?${AMT}\s+From:\s*DBS\/POSB\s+card\s+ending\s+(?<acct>\d{4})\s+To:\s*(?<merchant>.+?)\s+If\s+unauthori`, 'i') },
  { id: 'ocbc-email-card', bank: 'OCBC', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`(?<currency>SGD|USD|EUR)\s?${AMT}\s+was\s+charged\s+at\s+[\d:]+\s+on\s+(?<date>\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+to\s+your\s+card\s+\(-(?<acct>\d{4})\)\s+at\s+(?<merchant>.+?)\.\s`, 'i') },
  { id: 'canara-sms-debit', bank: 'Canara', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`An\s+amount\s+of\s+INR\s+${AMT}\s+has\s+been\s+DEBITED\s+to\s+your\s+account\s+X*(?<acct>\d{3,4})\s+on\s+(?<date>\d{2}\/\d{2}\/\d{4})(?:\s+towards\s+(?<merchant>[^.]+?))?\s*\.`, 'i') },
  { id: 'canara-sms-credit', bank: 'Canara', kind: 'txn', dir: 'credit',
    re: new RegExp(String.raw`INR\s+${AMT}\s+credited\s+to\s+A\/c\s+X*(?<acct>\d{3,4})\s+on\s+(?<date>\d{2}\/\d{2}\/\d{4})\s+towards\s+(?<merchant>[^.]+?)\s*\.`, 'i') },

  // ---------- Older BankA and SBI email wordings (before late 2025) ----------
  // A cash withdrawal moves money from the bank to your pocket. The cash is
  // logged when it is spent, so the withdrawal itself is not spending.
  { id: 'banka-email-atm-old', bank: 'BankA', kind: 'notice', via: 'email',
    re: /Debit\s+Card\s+ending\s+\d+\s+for\s+ATM\s+withdrawal/i },
  { id: 'banka-email-card-old', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`Thank\s+you\s+for\s+using\s+your\s+BankA\s+Bank\s+(?:Credit|Debit)\s+Card\s+ending\s+${ACCT}\s+for\s+${RS}${AMT}\s+at\s+(?<merchant>.+?)\s+on\s+(?<date>\d{2}-\d{2}-\d{4})`, 'i') },
  { id: 'banka-email-card-reversal-older', bank: 'BankA', kind: 'txn', dir: 'credit', via: 'email',
    re: new RegExp(String.raw`transaction\s+reversal\s+has\s+been\s+initiated\s+for\s+${RS}${AMT},?\s+from\s+(?<merchant>.+?)\s+to\s+BankA\s+Bank\s+Credit\s+Card\s+ending\s+${ACCT}\s+on\s+(?<date>\d{2}-\d{2}-\d{4})`, 'i') },
  // These two state no date; the app appends the day the email was sent.
  { id: 'banka-email-netbanking-old', bank: 'BankA', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`NetBanking\s+for\s+payment\s+of\s+${RS}${AMT}\s+from\s+A\/c\s+X*(?<acct>\d{4})\s+to\s+(?<merchant>.+?)\s+As\s+a\s+thank[\s\S]*?\[sent\s+(?<date>\d{2}-\d{2}-\d{4})\]`, 'i') },
  { id: 'sbi-email-debit-card', bank: 'SBI', kind: 'txn', dir: 'debit', via: 'email',
    re: new RegExp(String.raw`using\s+your\s+SBI\s+Debit\s+Card\s+\d+X+(?<acct>\d{4})\s+for\s+a\s+purchase\s+worth\s+${RS}${AMT}\s+on\s+POS\s+(?<merchant>.+?)\s+at\s+[\s\S]*?\[sent\s+(?<date>\d{2}-\d{2}-\d{4})\]`, 'i') },

  // ---------- last resort ----------
  { id: 'generic-spent', bank: 'unknown', kind: 'txn', dir: 'debit',
    re: new RegExp(String.raw`${RS}${AMT}\s+(?:spent|debited|paid)\b.*?\b(?:at|to|towards)\s+(?<merchant>.+?)\s+on\s+${DATE}`, 'i') },
]

export const BALANCE_RE = new RegExp(BAL, 'i')

export const AMOUNT_ONLY = new RegExp(String.raw`${RS}${AMT}`, 'i')

// DLT sender header, e.g. BP-BankABN-S, VM-BankBANK-T, AD-AIRINF.
// The AD prefix is promotional, which never carries a real debit.
export const SENDER = /\b(?<prefix>[A-Z]{2})-(?<id>[A-Z0-9]{3,9})(?:-(?<cat>[STP]))?\b/
export function senderIsPromotional(text: string): boolean {
  const m = text.match(SENDER)
  return m?.groups?.prefix === 'AD' || m?.groups?.cat === 'P'
}
