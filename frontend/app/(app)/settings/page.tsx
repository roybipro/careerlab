import { Settings } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CalendarFeed } from "@/components/settings/calendar-feed";
import { EmailDigest } from "@/components/settings/email-digest";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, password, calendar link and email digest." icon={Settings} />
      <div className="grid max-w-xl grid-cols-1 gap-6">
        <ProfileForm />
        <PasswordForm />
        <CalendarFeed />
        {/* Reads ?email= (set by the unsubscribe link), which needs a Suspense boundary. */}
        <Suspense>
          <EmailDigest />
        </Suspense>
      </div>
    </>
  );
}
