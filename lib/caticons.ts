/**
 * One icon and one colour per category, the same on every screen, so Food
 * looks like Food in a list, a bar and a legend. Icons are Tabler's line set,
 * one family throughout; colours are Dime's category palette (--hue-N in
 * app/theme.css), fixed per group rather than by rank, so Food never changes
 * colour because something overtook it.
 */
export type IconName = 'IconBabyCarriage' | 'IconCoffee' | 'IconArrowBackUp' | 'IconBarbell' | 'IconBed' | 'IconBolt' | 'IconBriefcase' | 'IconBucket' | 'IconBuildingBank' | 'IconBuildingCommunity' | 'IconBuildingHospital' | 'IconBulb' | 'IconBus' | 'IconCake' | 'IconCar' | 'IconCarSuv' | 'IconCash' | 'IconChefHat' | 'IconCoin' | 'IconConfetti' | 'IconDeviceLaptop' | 'IconDeviceMobile' | 'IconDeviceTv' | 'IconDiamond' | 'IconDots' | 'IconExchange' | 'IconEyeglass' | 'IconFlame' | 'IconFriends' | 'IconGasStation' | 'IconGift' | 'IconGlassFull' | 'IconHeartHandshake' | 'IconHeartbeat' | 'IconHelp' | 'IconHome' | 'IconId' | 'IconKey' | 'IconLock' | 'IconMasksTheater' | 'IconMotorbike' | 'IconMovie' | 'IconParking' | 'IconPill' | 'IconPlane' | 'IconPlug' | 'IconReceiptTax' | 'IconRefresh' | 'IconScissors' | 'IconShieldCheck' | 'IconShirt' | 'IconShoe' | 'IconShoppingCart' | 'IconSofa' | 'IconSparkles' | 'IconSpray' | 'IconSteeringWheel' | 'IconStethoscope' | 'IconTicket' | 'IconTool' | 'IconToolsKitchen2' | 'IconTrash' | 'IconUsers' | 'IconWallet' | 'IconWifi' | 'IconBook' | 'IconRoad' | 'IconTrendingUp'

type Look = { icon: IconName; hue: number }

const LOOK: Record<string, Look> = {
  Apparel: { icon: 'IconShirt', hue: 9 },
  Clothing: { icon: 'IconShirt', hue: 9 },
  Footwear: { icon: 'IconShoe', hue: 9 },
  Accessories: { icon: 'IconEyeglass', hue: 9 },
  Beauty: { icon: 'IconScissors', hue: 7 },
  Haircut: { icon: 'IconScissors', hue: 7 },
  'Self-care': { icon: 'IconSparkles', hue: 7 },
  'Consulting Tools': { icon: 'IconBriefcase', hue: 17 },
  Culture: { icon: 'IconMasksTheater', hue: 4 },
  Entertainment: { icon: 'IconMovie', hue: 4 },
  Streaming: { icon: 'IconDeviceTv', hue: 4 },
  'Going Out': { icon: 'IconGlassFull', hue: 4 },
  Events: { icon: 'IconTicket', hue: 4 },
  Food: { icon: 'IconToolsKitchen2', hue: 2 },
  Groceries: { icon: 'IconShoppingCart', hue: 8 },
  Delivery: { icon: 'IconMotorbike', hue: 2 },
  'Eating Out': { icon: 'IconToolsKitchen2', hue: 2 },
  Indulgence: { icon: 'IconCake', hue: 7 },
  'Office Snacks': { icon: 'IconCoffee', hue: 14 },
  Beverages: { icon: 'IconCoffee', hue: 6 },
  Health: { icon: 'IconHeartbeat', hue: 9 },
  Doctor: { icon: 'IconStethoscope', hue: 9 },
  Physiotherapy: { icon: 'IconHeartbeat', hue: 9 },
  Insurance: { icon: 'IconShieldCheck', hue: 9 },
  Gym: { icon: 'IconBarbell', hue: 9 },
  Hospital: { icon: 'IconBuildingHospital', hue: 9 },
  Pharmacy: { icon: 'IconPill', hue: 9 },
  Holiday: { icon: 'IconGift', hue: 7 },
  Hotel: { icon: 'IconBed', hue: 5 },
  Hotels: { icon: 'IconBed', hue: 5 },
  Household: { icon: 'IconHome', hue: 15 },
  Supplies: { icon: 'IconSpray', hue: 15 },
  Appliances: { icon: 'IconPlug', hue: 15 },
  Repairs: { icon: 'IconTool', hue: 15 },
  Electronics: { icon: 'IconDeviceLaptop', hue: 15 },
  Furniture: { icon: 'IconSofa', hue: 15 },
  Miscellaneous: { icon: 'IconDots', hue: 16 },
  Other: { icon: 'IconDots', hue: 16 },
  Gifts: { icon: 'IconGift', hue: 18 },
  Charity: { icon: 'IconHeartHandshake', hue: 18 },
  Rent: { icon: 'IconKey', hue: 1 },
  Maintenance: { icon: 'IconBuildingCommunity', hue: 1 },
  Deposit: { icon: 'IconLock', hue: 1 },
  Salaries: { icon: 'IconUsers', hue: 13 },
  Driver: { icon: 'IconSteeringWheel', hue: 13 },
  Maid: { icon: 'IconBucket', hue: 13 },
  Cook: { icon: 'IconChefHat', hue: 13 },
  'Wasteful': { icon: 'IconTrash', hue: 16 },
  'Social Life': { icon: 'IconConfetti', hue: 3 },
  Friends: { icon: 'IconFriends', hue: 3 },
  Dues: { icon: 'IconTicket', hue: 3 },
  Tax: { icon: 'IconReceiptTax', hue: 17 },
  Transportation: { icon: 'IconCar', hue: 6 },
  'Parking and tolls': { icon: 'IconParking', hue: 6 },
  Parking: { icon: 'IconParking', hue: 6 },
  Toll: { icon: 'IconRoad', hue: 6 },
  Books: { icon: 'IconBook', hue: 4 },
  Car: { icon: 'IconCar', hue: 6 },
  Taxi: { icon: 'IconCarSuv', hue: 6 },
  Fuel: { icon: 'IconGasStation', hue: 6 },
  Travel: { icon: 'IconPlane', hue: 10 },
  Forex: { icon: 'IconExchange', hue: 10 },
  'Local Transport': { icon: 'IconBus', hue: 10 },
  Visas: { icon: 'IconId', hue: 10 },
  Flights: { icon: 'IconPlane', hue: 10 },
  Utilities: { icon: 'IconBulb', hue: 14 },
  Gas: { icon: 'IconFlame', hue: 14 },
  Mobile: { icon: 'IconDeviceMobile', hue: 14 },
  Phone: { icon: 'IconDeviceMobile', hue: 14 },
  Internet: { icon: 'IconWifi', hue: 14 },
  Power: { icon: 'IconBolt', hue: 14 },
  Subscriptions: { icon: 'IconRefresh', hue: 14 },
  Wedding: { icon: 'IconDiamond', hue: 11 },
  Income: { icon: 'IconWallet', hue: 8 },
  Salary: { icon: 'IconCash', hue: 8 },
  Interest: { icon: 'IconBuildingBank', hue: 8 },
  'Paid Back': { icon: 'IconHeartHandshake', hue: 8 },
  Refunds: { icon: 'IconArrowBackUp', hue: 8 },
  'Other Income': { icon: 'IconCoin', hue: 8 },
  // Money moved into investments. Still his money, so the income green
  // family, never a spending colour. Ruled by Alex, 5 Oct 2026.
  Investments: { icon: 'IconTrendingUp', hue: 8 },
  Investment: { icon: 'IconTrendingUp', hue: 8 },
  Uncategorised: { icon: 'IconHelp', hue: 0 },
}

/** The look for a category name; a sub-category without its own falls back to its group. */
// Names are matched without regard to capitals, so renaming "Eating out" to
// "Eating Out" keeps its icon and colour.
const LOWER = new Map(Object.entries(LOOK).map(([k, v]) => [k.toLowerCase(), v]))

export function lookFor(name: string | null | undefined, group?: string | null): Look {
  return (name && (LOOK[name] ?? LOWER.get(name.toLowerCase()))) || (group && (LOOK[group] ?? LOWER.get(group.toLowerCase()))) || LOOK.Uncategorised
}

/** The colour for a group, as a CSS value. */
export function hueFor(name: string | null | undefined) {
  const h = lookFor(name).hue
  return h ? `var(--hue-${h})` : 'var(--page-text-muted)'
}
