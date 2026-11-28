import { Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CalendarFeed } from "@/components/settings/calendar-feed";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, password and calendar link." icon={Settings} />
      <div className="grid max-w-xl grid-cols-1 gap-6">
        <ProfileForm />
        <PasswordForm />
        <CalendarFeed />
      </div>
    </>
  );
}
