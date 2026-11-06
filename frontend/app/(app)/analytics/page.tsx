"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Briefcase, CalendarRange, FlaskConical } from "lucide-react";
import { MonthlyActivity } from "@/components/charts/monthly-activity";
import { StatusDistribution } from "@/components/charts/status-distribution";
import { DataState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { keys } from "@/lib/keys";
import type { Analytics } from "@/lib/types";

export default function AnalyticsPage() {
  const query = useQuery({ queryKey: keys.dashboardPart("analytics"), queryFn: () => api<Analytics>("/dashboard/analytics") });

  return (
    <>
      <PageHeader title="Analytics" description="How your search is going." icon={BarChart3} />
      <DataState query={query} isEmpty={() => false}>
        {(data) => (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Briefcase aria-hidden="true" />
                  Job applications by status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusDistribution title="Job applications by status" data={data.job_status} emptyHint="Add a job application and its status shows up here." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <FlaskConical aria-hidden="true" />
                  Research opportunities by status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusDistribution title="Research opportunities by status" data={data.research_status} emptyHint="Add a research opportunity and its status shows up here." />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  <CalendarRange aria-hidden="true" />
                  Monthly activity
                </CardTitle>
                <CardDescription>Applications and opportunities by application date, last 12 months. Records with no application date are not counted.</CardDescription>
              </CardHeader>
              <CardContent>
                <MonthlyActivity data={data.monthly} />
              </CardContent>
            </Card>
          </div>
        )}
      </DataState>
    </>
  );
}
