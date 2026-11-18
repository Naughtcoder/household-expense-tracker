import { IconBabyCarriage, IconCoffee, IconArrowBackUp, IconBarbell, IconBed, IconBolt, IconBriefcase, IconBucket, IconBuildingBank, IconBuildingCommunity, IconBuildingHospital, IconBulb, IconBus, IconCake, IconCar, IconCarSuv, IconCash, IconChefHat, IconCoin, IconConfetti, IconDeviceLaptop, IconDeviceMobile, IconDeviceTv, IconDiamond, IconDots, IconExchange, IconEyeglass, IconFlame, IconFriends, IconGasStation, IconGift, IconGlassFull, IconHeartHandshake, IconHeartbeat, IconHelp, IconHome, IconId, IconKey, IconLock, IconMasksTheater, IconMotorbike, IconMovie, IconParking, IconPill, IconPlane, IconPlug, IconReceiptTax, IconRefresh, IconScissors, IconShieldCheck, IconShirt, IconShoe, IconShoppingCart, IconSofa, IconSparkles, IconSpray, IconSteeringWheel, IconStethoscope, IconTicket, IconTool, IconToolsKitchen2, IconTrash, IconUsers, IconWallet, IconWifi, IconBook, IconRoad, IconTrendingUp } from '@tabler/icons-react'
import { lookFor, type IconName } from '../lib/caticons'

const ICONS: Record<IconName, typeof IconHelp> = { IconBabyCarriage, IconCoffee, IconArrowBackUp, IconBarbell, IconBed, IconBolt, IconBriefcase, IconBucket, IconBuildingBank, IconBuildingCommunity, IconBuildingHospital, IconBulb, IconBus, IconCake, IconCar, IconCarSuv, IconCash, IconChefHat, IconCoin, IconConfetti, IconDeviceLaptop, IconDeviceMobile, IconDeviceTv, IconDiamond, IconDots, IconExchange, IconEyeglass, IconFlame, IconFriends, IconGasStation, IconGift, IconGlassFull, IconHeartHandshake, IconHeartbeat, IconHelp, IconHome, IconId, IconKey, IconLock, IconMasksTheater, IconMotorbike, IconMovie, IconParking, IconPill, IconPlane, IconPlug, IconReceiptTax, IconRefresh, IconScissors, IconShieldCheck, IconShirt, IconShoe, IconShoppingCart, IconSofa, IconSparkles, IconSpray, IconSteeringWheel, IconStethoscope, IconTicket, IconTool, IconToolsKitchen2, IconTrash, IconUsers, IconWallet, IconWifi, IconBook, IconRoad, IconTrendingUp }

/**
 * A category's icon on a soft tile of its colour. `group` is the top-level
 * category, used when the sub-category has no icon of its own.
 */
export function CatIcon({ name, group, size = 34 }: { name: string | null | undefined; group?: string | null; size?: number }) {
  const look = lookFor(name, group)
  const Icon = ICONS[look.icon]
  const colour = look.hue ? `var(--hue-${look.hue})` : 'var(--page-text-muted)'
  return (
    <span className="caticon" aria-hidden="true"
      style={{ width: size, height: size, color: colour, background: `color-mix(in srgb, ${colour} 15%, transparent)` }}>
      <Icon size={Math.round(size * 0.56)} stroke={1.8} />
    </span>
  )
}
