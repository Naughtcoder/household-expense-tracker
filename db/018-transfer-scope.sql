-- Money moved between his own accounts (BankA to BankB 1111) is not spending.
alter type scope add value if not exists 'transfer';
