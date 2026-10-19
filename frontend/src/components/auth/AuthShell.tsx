import {
  CalendarCheck,
  Pill,
  Stethoscope,
  Users,
} from "lucide-react";
import logoShort from "@/assets/logos/logo-short.png";
import logoLong from "@/assets/logos/logo-long.png";
import loginDash from "@/assets/login-dash.png";

const features = [
  { icon: Users, label: "Patient Records" },
  { icon: CalendarCheck, label: "Appointments" },
  { icon: Stethoscope, label: "Doctors & Staff" },
  { icon: Pill, label: "Billing & Pharmacy" },
];

// Same split layout as LoginPage: blue pitch panel stays, only the right-hand form changes.
export function AuthShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-[#024BAB] flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10 flex items-center gap-3">
          <img
            src={logoShort}
            alt="NestCare"
            className="w-14 h-14 object-contain"
          />
          <span className="font-display font-bold text-white text-2xl">
            NestCare
          </span>
        </div>
        <img
          src={loginDash}
          alt="Dashboard preview"
          className="relative z-10 max-w-3xl mx-auto"
        />
        <div className="relative z-10">
          <h1 className="text-3xl xl:text-4xl font-display font-bold text-white leading-tight mb-5">
            Every patient.
            
            Every appointment.
            
            One place.
          </h1>
          <p className="text-white/70 text-base font-medium max-w-sm">
            Run your clinic or hospital from a single workspace and never miss a
            visit again.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2">
          {features.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-2 text-white text-sm font-bold"
            >
              <Icon className="w-4 h-4 text-white/70" />
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-white flex items-center justify-center p-6 sm:p-10">
        <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"}`}>
          <div className="lg:hidden mb-8">
            <img
              src={logoLong}
              alt="NestCare"
              className="h-12 object-contain"
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
