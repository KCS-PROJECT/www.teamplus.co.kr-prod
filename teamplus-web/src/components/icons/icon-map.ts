import {
  LayoutDashboard, Users, BookOpen, CalendarDays, CreditCard,
  QrCode, Bell, Settings, ShoppingBag, Trophy, MessageSquare,
  BarChart3, Shield, Star, Gift, Camera, Clipboard,
  UserCircle, ChevronRight, Search, Home, Scan,
  Baby, GraduationCap, Dumbbell, Target, Medal,
  FileText, Package, Truck, Tag, Heart,
  AlertCircle, CheckCircle, XCircle, Info,
  Plus, Edit, Trash2, Eye, Download, Upload,
  RefreshCw, Filter, SortAsc, ChevronDown, MoreHorizontal,
  LogOut, Lock, Key, Fingerprint, Phone,
  Map, MapPin, Clock, Calendar, Timer,
} from 'lucide-react';

// 역할별 메인 아이콘
export const RoleIcons = {
  ADMIN: Shield,
  DIRECTOR: Trophy,
  COACH: Dumbbell,
  PARENT: Baby,
  TEEN: GraduationCap,
  CHILD: Star,
} as const;

// 도메인별 아이콘
export const DomainIcons = {
  dashboard: LayoutDashboard,
  members: Users,
  classes: BookOpen,
  schedule: CalendarDays,
  credits: CreditCard,
  attendance: QrCode,
  notifications: Bell,
  settings: Settings,
  shop: ShoppingBag,
  tournaments: Trophy,
  messages: MessageSquare,
  statistics: BarChart3,
  security: Shield,
  achievements: Star,
  gifts: Gift,
  gallery: Camera,
  reports: Clipboard,
  profile: UserCircle,
  search: Search,
  home: Home,
} as const;

// 상태 아이콘
export const StatusIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
} as const;

// 액션 아이콘
export const ActionIcons = {
  add: Plus,
  edit: Edit,
  delete: Trash2,
  view: Eye,
  download: Download,
  upload: Upload,
  refresh: RefreshCw,
  filter: Filter,
  sort: SortAsc,
  more: MoreHorizontal,
} as const;

// 네비게이션 아이콘
export const NavIcons = {
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  home: Home,
  search: Search,
  scan: Scan,
  logOut: LogOut,
} as const;

// 인증/보안 아이콘
export const AuthIcons = {
  lock: Lock,
  key: Key,
  fingerprint: Fingerprint,
  phone: Phone,
  shield: Shield,
} as const;

// 시간/장소 아이콘
export const ContextIcons = {
  map: Map,
  mapPin: MapPin,
  clock: Clock,
  calendar: Calendar,
  timer: Timer,
} as const;

// 쇼핑몰 아이콘
export const ShopIcons = {
  product: Package,
  shipping: Truck,
  tag: Tag,
  heart: Heart,
  cart: ShoppingBag,
  receipt: FileText,
} as const;

// 스포츠/성과 아이콘
export const SportIcons = {
  target: Target,
  medal: Medal,
  trophy: Trophy,
  star: Star,
  badge: Gift,
} as const;
