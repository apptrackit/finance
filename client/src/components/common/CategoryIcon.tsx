import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Baby, Banknote, Beer, Bike, BookOpen, Bookmark, Briefcase, Building2, Bus, Cake, Car, CarFront, CarTaxiFront, Cat, ChartColumn, ChartLine, Cherry, CircleDot, Clapperboard, Cloud, Coffee, Coins, CreditCard, CupSoda, Dna, Dog, DollarSign, Drama, Dribbble, Droplet, Droplets, Dumbbell, FileText, Flame, FlaskConical, Flower, Flower2, Footprints, Fuel, Gamepad2, Gift, GlassWater, Glasses, Globe, GraduationCap, Guitar, Hammer, HandCoins, Heart, HeartCrack, HeartPulse, Hospital, Hotel, House, Landmark, Laptop, Library, Lightbulb, Mail, Mailbox, MapPin, Microscope, Music, Navigation, NotebookPen, Package, Palette, PartyPopper, PawPrint, Pencil, PiggyBank, Pill, Pin, Pizza, Plane, PlugZap, Rabbit, Rainbow, Rat, Receipt, RefreshCw, Salad, Sandwich, School, Scissors, Shirt, ShoppingBag, ShoppingCart, ShowerHead, Smartphone, Smile, Soup, Sparkle, Sparkles, Sprout, Star, Stethoscope, Store, Sun, Swords, Syringe, Tag, Target, TestTube, Ticket, ToyBrick, TrainFront, TreePalm, TrendingDown, TrendingUp, Trophy, Tv, UtensilsCrossed, Volleyball, Wrench, Zap,
} from 'lucide-react'

/**
 * Categories store an emoji (user-chosen, shared with the API and MCP). The
 * interface draws each one as a line icon so every category matches the rest
 * of the app's icon weight; unknown values fall back to a tag.
 */
const ICONS: Record<string, LucideIcon> = {
  '💰': PiggyBank,
  '💵': Banknote,
  '💳': CreditCard,
  '💸': HandCoins,
  '🏦': Landmark,
  '💼': Briefcase,
  '📊': ChartColumn,
  '📈': TrendingUp,
  '📉': TrendingDown,
  '💹': ChartLine,
  '🛒': ShoppingCart,
  '🍕': Pizza,
  '🍔': Sandwich,
  '🍜': Soup,
  '🥗': Salad,
  '🍱': UtensilsCrossed,
  '☕': Coffee,
  '🍺': Beer,
  '🥤': CupSoda,
  '🧃': GlassWater,
  '🏠': House,
  '🏢': Building2,
  '🏪': Store,
  '🏨': Hotel,
  '🏥': Hospital,
  '🏫': School,
  '⛽': Fuel,
  '🚗': Car,
  '🚕': CarTaxiFront,
  '🚙': CarFront,
  '✈': Plane,
  '🚆': TrainFront,
  '🚌': Bus,
  '🚲': Bike,
  '🛴': Navigation,
  '⚡': Zap,
  '💡': Lightbulb,
  '🔌': PlugZap,
  '📱': Smartphone,
  '💻': Laptop,
  '🎮': Gamepad2,
  '🎬': Clapperboard,
  '🎵': Music,
  '🎸': Guitar,
  '🎨': Palette,
  '📚': Library,
  '📖': BookOpen,
  '✏': Pencil,
  '📝': NotebookPen,
  '📦': Package,
  '🎁': Gift,
  '🎉': PartyPopper,
  '🎊': Sparkles,
  '🎈': Cake,
  '💐': Flower2,
  '🌹': Flower,
  '🌺': Flower2,
  '🌻': Sun,
  '🌷': Sprout,
  '🌸': Cherry,
  '👕': Shirt,
  '👔': Shirt,
  '👗': Shirt,
  '👠': Footprints,
  '👟': Footprints,
  '💄': Sparkles,
  '💅': Sparkles,
  '💆': HeartPulse,
  '💇': Scissors,
  '🧴': Droplets,
  '🏋': Dumbbell,
  '⚽': Volleyball,
  '🏀': Dribbble,
  '🎾': Trophy,
  '🏐': Volleyball,
  '🏓': Trophy,
  '🏸': Trophy,
  '🥊': Swords,
  '🎯': Target,
  '🎱': CircleDot,
  '💊': Pill,
  '💉': Syringe,
  '🩺': Stethoscope,
  '🧬': Dna,
  '🔬': Microscope,
  '🧪': FlaskConical,
  '🧫': TestTube,
  '🦷': Smile,
  '👓': Glasses,
  '🐶': Dog,
  '🐱': Cat,
  '🐭': Rat,
  '🐹': Rabbit,
  '🐰': Rabbit,
  '🦊': PawPrint,
  '🐻': PawPrint,
  '🐼': PawPrint,
  '🐨': PawPrint,
  '🐯': PawPrint,
  '❤': Heart,
  '💙': Heart,
  '💚': Heart,
  '💛': Heart,
  '🧡': Heart,
  '💜': Heart,
  '🖤': Heart,
  '🤍': Heart,
  '🤎': Heart,
  '💔': HeartCrack,
  '⭐': Star,
  '✨': Sparkles,
  '🌟': Star,
  '💫': Sparkle,
  '🔥': Flame,
  '💥': Zap,
  '🎆': Sparkles,
  '🎇': Sparkles,
  '🌈': Rainbow,
  '☀': Sun,
  '📌': Pin,
  '📍': MapPin,
  '🔖': Bookmark,
  '🏷': Tag,
  '🎫': Ticket,
  '🎟': Ticket,
  '📮': Mailbox,
  '📬': Mail,
  '📭': Mail,
  '📪': Mail,
  '📄': FileText,
  '🔄': RefreshCw,
  '🏡': House,
  '🍽': UtensilsCrossed,
  '🚇': TrainFront,
  '🎓': GraduationCap,
  '🧾': Receipt,
  '🛍': ShoppingBag,
  '💲': DollarSign,
  '🪙': Coins,
  '🏖': TreePalm,
  '🧸': ToyBrick,
  '👶': Baby,
  '🐾': PawPrint,
  '🎭': Drama,
  '📺': Tv,
  '🔧': Wrench,
  '🛠': Hammer,
  '🧹': Sparkles,
  '🚿': ShowerHead,
  '🌐': Globe,
  '☁': Cloud,
  '💧': Droplet,
}

const normalize = (value: string) => value.replace(/\uFE0F/g, '').trim()

export function categoryIconFor(value?: string | null): LucideIcon {
  return (value && ICONS[normalize(value)]) || Tag
}

/** Readable name for an icon choice, e.g. "Shopping cart". */
export function categoryIconLabel(value?: string | null): string {
  const name = categoryIconFor(value).displayName ?? 'Tag'
  return name.replace(/\d+$/, '').replace(/(?<!^)([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`)
}

/** One emoji per distinct icon, in picker order; the emoji is what gets stored. */
export function distinctIconOptions(options: readonly string[]): string[] {
  const seen = new Set<LucideIcon>()
  return options.filter(option => {
    const icon = categoryIconFor(option)
    if (seen.has(icon)) return false
    seen.add(icon)
    return true
  })
}

export function CategoryIcon({ icon, className = 'h-4 w-4', ...props }: { icon?: string | null } & LucideProps) {
  const Icon = categoryIconFor(icon)
  return <Icon aria-hidden="true" className={className} strokeWidth={1.75} {...props} />
}
