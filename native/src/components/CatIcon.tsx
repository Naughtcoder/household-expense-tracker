import { Platform, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { lookFor } from '@lib/caticons.ts'
import { C, HUES } from '@/theme'

// The website's category icons are Tabler icons; on iPhone the nearest SF
// Symbol is used instead, so the app looks native. Anything unmapped shows
// the category's first letter on its colour.
const SF: Record<string, string> = {
  IconToolsKitchen2: 'fork.knife', IconCoffee: 'cup.and.saucer.fill', IconShoppingCart: 'cart.fill',
  IconCar: 'car.fill', IconCarSuv: 'car.fill', IconGasStation: 'fuelpump.fill', IconParking: 'parkingsign.circle.fill',
  IconRoad: 'road.lanes', IconBus: 'bus.fill', IconPlane: 'airplane', IconBed: 'bed.double.fill', IconHome: 'house.fill',
  IconKey: 'key.fill', IconBolt: 'bolt.fill', IconWifi: 'wifi', IconDeviceMobile: 'iphone', IconPill: 'pills.fill',
  IconStethoscope: 'stethoscope', IconHeartbeat: 'heart.text.square.fill', IconBuildingHospital: 'cross.case.fill',
  IconShirt: 'tshirt.fill', IconShoe: 'shoeprints.fill', IconScissors: 'scissors', IconSparkles: 'sparkles',
  IconGift: 'gift.fill', IconMovie: 'film.fill', IconTicket: 'ticket.fill', IconBook: 'book.fill',
  IconBriefcase: 'briefcase.fill', IconCash: 'banknote.fill', IconCoin: 'indianrupeesign.circle.fill',
  IconUsers: 'person.2.fill', IconFriends: 'person.3.fill', IconSofa: 'sofa.fill', IconTool: 'wrench.and.screwdriver.fill',
  IconDeviceLaptop: 'laptopcomputer', IconDeviceTv: 'tv.fill', IconTrash: 'trash.fill', IconGlassFull: 'wineglass.fill',
  IconConfetti: 'party.popper.fill', IconRefresh: 'arrow.triangle.2.circlepath', IconArrowBackUp: 'arrow.uturn.backward',
  IconHeartHandshake: 'hands.sparkles.fill', IconReceiptTax: 'doc.text.fill', IconShieldCheck: 'checkmark.shield.fill',
  IconBarbell: 'dumbbell.fill', IconMasksTheater: 'theatermasks.fill', IconBuildingBank: 'building.columns.fill',
  IconWallet: 'wallet.pass.fill', IconHelp: 'questionmark', IconDots: 'ellipsis', IconPlug: 'powerplug.fill',
  IconBulb: 'lightbulb.fill', IconFlame: 'flame.fill', IconSpray: 'bubbles.and.sparkles.fill', IconChefHat: 'frying.pan.fill',
  IconBabyCarriage: 'stroller.fill', IconMotorbike: 'scooter', IconSteeringWheel: 'steeringwheel', IconId: 'person.text.rectangle.fill',
  IconBuildingCommunity: 'building.2.fill', IconExchange: 'arrow.left.arrow.right', IconDiamond: 'diamond.fill', IconEyeglass: 'eyeglasses',
  IconBucket: 'bubbles.and.sparkles', IconLock: 'lock.fill', IconCake: 'birthday.cake.fill',
  IconTrendingUp: 'chart.line.uptrend.xyaxis',
}

export function CatIcon({ name, group, size = 36 }: { name?: string | null; group?: string | null; size?: number }) {
  // Money between the two of them, or their own accounts.
  if (name === 'Transfer') return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
      {Platform.OS === 'ios' ? <SymbolView name="arrow.left.arrow.right" tintColor={C.text2} size={size * 0.48} /> : <Text style={{ color: C.text2 }}>⇄</Text>}
    </View>
  )
  const look = lookFor(name ?? 'Uncategorised', group)
  const bg = look.hue ? HUES[look.hue] : C.raised
  const sf = SF[look.icon]
  // White on a coloured tile in both themes; on the plain grey tile (no hue)
  // the glyph takes the text colour, or it would vanish in light mode.
  const fg = look.hue ? '#FFFFFF' : C.text
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {Platform.OS === 'ios' && sf
        ? <SymbolView name={sf as never} tintColor={fg} size={size * 0.52} />
        : <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.42 }}>{(name ?? '?').charAt(0)}</Text>}
    </View>
  )
}
