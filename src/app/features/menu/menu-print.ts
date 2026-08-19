export type MenuPrintItem = {
  name: string;
  description?: string | null;
  price?: number | null;
  priceLabel?: string | null;
};

export type MenuPrintSection = {
  name: string;
  items: MenuPrintItem[];
};

export type MenuPrintInput = {
  shopName: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  phone?: string | null;
  instagramHandle?: string | null;
  menuTitle?: string | null;
  note?: string | null;
  hasSourceFile?: boolean;
  books?: Array<{ title: string; active?: boolean }>;
  sections: MenuPrintSection[];
};
