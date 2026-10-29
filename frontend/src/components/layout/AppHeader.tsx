import { Menu } from "lucide-react";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

interface AppHeaderProps {
  title: string;
  onMobileMenuClick: () => void;
}

export function AppHeader({ title, onMobileMenuClick }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b-2 border-black bg-white px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuClick}
          className="border-2 border-black p-1.5 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-display text-lg font-bold tracking-tight md:text-xl">
          {title}
        </h1>
      </div>

      <ProfileMenu />
    </header>
  );
}
