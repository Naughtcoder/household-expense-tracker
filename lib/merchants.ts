// Canonical merchant aliases. Key is matched against the cleaned descriptor.
// Longest key wins, so put specific keys in and let the matcher sort them.
// category is the default; the user can override and that override becomes a rule.

export interface Alias { name: string; category: string; sub?: string }

export const ALIASES: Record<string, Alias> = {
  // food delivery and quick commerce
  SWIGGY:            { name: 'Swiggy', category: 'Food', sub: 'Delivery' },
  INSTAMART:         { name: 'Swiggy Instamart', category: 'Food', sub: 'Groceries' },
  ZOMATO:            { name: 'Zomato', category: 'Food', sub: 'Delivery' },
  ETERNAL:           { name: 'Zomato', category: 'Food', sub: 'Delivery' },
  ZEPTO:             { name: 'Zepto', category: 'Food', sub: 'Groceries' },
  BLINKIT:           { name: 'Blinkit', category: 'Food', sub: 'Groceries' },
  'BLINK COMMERCE':  { name: 'Blinkit', category: 'Food', sub: 'Groceries' },
  BIGBASKET:         { name: 'BigBasket', category: 'Food', sub: 'Groceries' },
  DUNZO:             { name: 'Dunzo', category: 'Food', sub: 'Groceries' },
  LICIOUS:           { name: 'Licious', category: 'Food', sub: 'Groceries' },

  // transport
  UBER:              { name: 'Uber', category: 'Transportation', sub: 'Taxi' },
  OLA:               { name: 'Ola', category: 'Transportation', sub: 'Taxi' },
  RAPIDO:            { name: 'Rapido', category: 'Transportation', sub: 'Taxi' },
  YANDEX:            { name: 'Yandex Go', category: 'Transportation', sub: 'Taxi' },
  BLUSMART:          { name: 'BluSmart', category: 'Transportation', sub: 'Taxi' },
  IOCL:              { name: 'Indian Oil', category: 'Transportation', sub: 'Car' },
  'BHARAT PETROLEUM':{ name: 'BPCL', category: 'Transportation', sub: 'Car' },
  'HP PETROL':       { name: 'HPCL', category: 'Transportation', sub: 'Car' },
  FASTAG:            { name: 'FASTag', category: 'Transportation', sub: 'Car' },

  // travel
  MAKEMYTRIP:        { name: 'MakeMyTrip', category: 'Travel' },
  'CT FLIGHT':       { name: 'Cleartrip', category: 'Travel' },
  CLEARTRIP:         { name: 'Cleartrip', category: 'Travel' },
  GOIBIBO:           { name: 'Goibibo', category: 'Travel' },
  INDIGO:            { name: 'IndiGo', category: 'Travel', sub: 'Air' },
  'AIR INDIA':       { name: 'Air India', category: 'Travel', sub: 'Air' },
  AKASA:             { name: 'Akasa Air', category: 'Travel', sub: 'Air' },
  IRCTC:             { name: 'IRCTC', category: 'Travel', sub: 'Rail' },
  ADANIONE:          { name: 'Adani One', category: 'Travel', sub: 'Airport' },
  AGODA:             { name: 'Agoda', category: 'Hotel' },
  'BOOKING COM':     { name: 'Booking.com', category: 'Hotel' },
  AIRBNB:            { name: 'Airbnb', category: 'Hotel' },
  MARRIOTT:          { name: 'Marriott', category: 'Hotel' },
  'DOUBLE TREE':     { name: 'DoubleTree', category: 'Hotel' },
  DOUBLETREE:        { name: 'DoubleTree', category: 'Hotel' },
  TSIM:              { name: 'TSIM eSIM', category: 'Travel', sub: 'Connectivity' },

  MAKEMYTR:          { name: 'MakeMyTrip', category: 'Travel' },
  BLUSMAR:           { name: 'BluSmart', category: 'Transportation', sub: 'Taxi' },
  SWIGGYXL:          { name: 'Swiggy', category: 'Food', sub: 'Delivery' },
  WWWZEPTO:          { name: 'Zepto', category: 'Food', sub: 'Groceries' },
  'APPLE MEDIA':     { name: 'Apple', category: 'Entertainment', sub: 'Subscription' },
  'APPLE.COMBILL':   { name: 'Apple', category: 'Entertainment', sub: 'Subscription' },
  NETFLIX:           { name: 'Netflix', category: 'Entertainment', sub: 'Subscription' },

  // shopping
  AMAZON:            { name: 'Amazon', category: 'Household' },
  ASSPL:             { name: 'Amazon', category: 'Household' },   // Amazon Seller Services Pvt Ltd
  AMAZONPAY:         { name: 'Amazon Pay', category: 'Household' },
  AMZN:              { name: 'Amazon', category: 'Household' },
  FKRT:              { name: 'Flipkart', category: 'Household' },
  FLIPKART:          { name: 'Flipkart', category: 'Household' },
  MYNTRA:            { name: 'Myntra', category: 'Apparel' },
  AJIO:              { name: 'Ajio', category: 'Apparel' },
  NYKAA:             { name: 'Nykaa', category: 'Beauty' },
  IKEA:              { name: 'IKEA', category: 'Household' },
  'GREEN SOUL':      { name: 'Green Soul', category: 'Household', sub: 'Furniture' },
  DECATHLON:         { name: 'Decathlon', category: 'Apparel' },

  // bills, utilities, subscriptions
  AIRTEL:            { name: 'Airtel', category: 'Utilities', sub: 'Mobile' },
  JIO:               { name: 'Jio', category: 'Utilities', sub: 'Mobile' },
  ACT:               { name: 'ACT Fibernet', category: 'Utilities', sub: 'Internet' },
  BESCOM:            { name: 'BESCOM', category: 'Utilities', sub: 'Power' },
  SPOTIFY:           { name: 'Spotify', category: 'Entertainment', sub: 'Subscription' },
  'GOOGLE ONE':      { name: 'Google One', category: 'Utilities', sub: 'Subscription' },
  OPENAI:            { name: 'OpenAI', category: 'Consulting Tools' },
  ANTHROPIC:         { name: 'Anthropic', category: 'Consulting Tools' },
  PADDLE:            { name: 'Paddle', category: 'Consulting Tools' },
  'N8N CLOUD':       { name: 'n8n', category: 'Consulting Tools' },

  // health
  APOLLO:            { name: 'Apollo', category: 'Health', sub: 'Pharmacy' },
  PHARMEASY:         { name: 'PharmEasy', category: 'Health', sub: 'Pharmacy' },
  '1MG':             { name: 'Tata 1mg', category: 'Health', sub: 'Pharmacy' },
  CULT:              { name: 'Cult.fit', category: 'Health', sub: 'Gym' },
  PRACTO:            { name: 'Practo', category: 'Health' },
  MANIPAL:           { name: 'Manipal Hospital', category: 'Health', sub: 'Hospital' },
  CLOUDNINE:         { name: 'Cloudnine', category: 'Health', sub: 'Hospital' },

  // home and services
  NOBROKER:          { name: 'NoBroker', category: 'Rent' },
  BOOKMYSHOW:        { name: 'BookMyShow', category: 'Entertainment' },
  URBANCOMPANY:      { name: 'Urban Company', category: 'Household' },
  'URBAN COMPANY':   { name: 'Urban Company', category: 'Household' },
}

const KEYS = Object.keys(ALIASES).sort((a, b) => b.length - a.length)

export function lookupAlias(cleaned: string): (Alias & { key: string }) | null {
  for (const k of KEYS) {
    if (cleaned === k || cleaned.startsWith(k + ' ') || cleaned.includes(k)) {
      return { ...ALIASES[k], key: k }
    }
  }
  // Card alerts truncate merchant names to a fixed width, so MAKEMYTRIP
  // arrives as MAKEMYTR. Accept a prefix match once it is long enough to
  // be unambiguous.
  const first = cleaned.split(' ')[0]
  if (first.length >= 6) {
    for (const k of KEYS) {
      if (k.length >= 6 && (k.startsWith(first) || first.startsWith(k))) {
        return { ...ALIASES[k], key: k }
      }
    }
  }
  return null
}
