import { useNavigate } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface AppHeaderProps {
  title: string;
  onMobileMenuClick: () => void;
}

export function AppHeader({ title, onMobileMenuClick }: AppHeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

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

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-bold leading-tight">{user?.name}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {user?.role.replace(/_/g, " ")}
          </p>
        </div>
        <Avatar className="h-9 w-9">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
