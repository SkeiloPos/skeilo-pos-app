/**
 * Catálogo semántico de íconos → ligadura de Material Icons (variante Outlined).
 * Fuente de verdad: specs/082-estandarizacion-iconos-admin/data-model.md.
 *
 * Las plantillas nunca escriben el nombre de la ligadura de Google directamente
 * (contracts/icon-component-contract.md) — siempre piden un nombre semántico de
 * este catálogo. Los 35 nombres heredados de `app-icon` conservan su vocabulario
 * original para minimizar el cambio en las plantillas que ya los usaban.
 */
export const ICON_CATALOG: Record<string, string> = {
  // Heredados de `app-icon` (mismo nombre semántico, nueva ligadura)
  dashboard: 'dashboard',
  sales: 'point_of_sale',
  reports: 'assessment',
  orders: 'receipt_long',
  tables: 'table_restaurant',
  sessions: 'point_of_sale',
  products: 'shopping_bag',
  categories: 'category',
  promotions: 'local_offer',
  'option-groups': 'tune',
  units: 'straighten',
  inventory: 'inventory_2',
  suppliers: 'local_shipping',
  cash: 'payments',
  'payment-methods': 'credit_card',
  users: 'group',
  eye: 'visibility',
  'eye-off': 'visibility_off',
  settings: 'settings',
  tenants: 'storefront',
  home: 'home',
  receipt: 'receipt',
  cart: 'shopping_cart',
  exit: 'logout',
  search: 'search',
  layers: 'layers',
  transfer: 'sync_alt',
  upload: 'upload',
  close: 'close',
  back: 'arrow_back',
  'check-circle': 'check_circle',
  'alert-circle': 'warning',
  'image-off': 'hide_image',
  copy: 'content_copy',
  download: 'download',

  // Nuevos, derivados de emoji (data-model.md) — el nombre semántico coincide con
  // la ligadura porque no existía vocabulario previo que preservar.
  storefront: 'storefront',
  admin_panel_settings: 'admin_panel_settings',
  shopping_bag: 'shopping_bag',
  group: 'group',
  receipt_long: 'receipt_long',
  payments: 'payments',
  restaurant: 'restaurant',
  table_restaurant: 'table_restaurant',
  palette: 'palette',
  print: 'print',
  check: 'check',
  person: 'person',
  photo_camera: 'photo_camera',
  edit: 'edit',
  circle: 'circle',
  check_circle: 'check_circle',
  location_on: 'location_on',
  call: 'call',
  delivery_dining: 'delivery_dining',
  lock_open: 'lock_open',
  shopping_cart: 'shopping_cart',
  sell: 'sell',
  credit_card: 'credit_card',

  // Descubiertos durante la implementación: SVG artesanales que no pasaban por
  // `app-icon` ni eran emoji (ver data-model.md, sección "descubiertos durante
  // la implementación").
  menu: 'menu',
  notifications: 'notifications',
  expand_more: 'expand_more',
  lock: 'lock',
  add: 'add',
  add_circle: 'add_circle',
  schedule: 'schedule',
  qr_code_scanner: 'qr_code_scanner',
  delete: 'delete',
  calendar_month: 'calendar_month',
  emoji_events: 'emoji_events',
  autorenew: 'autorenew',
  warning: 'warning',
  arrow_back: 'arrow_back',
  logout: 'logout',
  block: 'block',
  category: 'category',
  point_of_sale: 'point_of_sale',
  tune: 'tune',

  // spec 106: estrella de proveedor preferido (un solo glifo; el estado
  // "preferido" se distingue por color, no por una segunda ligadura).
  star: 'star',

  // Ícono de reserva para un `name` desconocido (contracts/icon-component-contract.md)
  help_outline: 'help_outline',
};

export const ICON_FALLBACK = 'help_outline';
