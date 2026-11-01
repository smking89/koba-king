import { Home, ShoppingBag, Server, LifeBuoy, User } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/account", label: "Account", icon: User },
] as const;
