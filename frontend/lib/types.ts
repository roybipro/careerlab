export type User = {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
};

export type ApiErrorDetail = {
  loc: (string | number)[];
  message: string;
  type: string;
};

/** Shape returned by every list endpoint. */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type Job = {
  id: string;
  company_name: string;
  position_title: string;
  company_website: string | null;
  company_logo_url: string | null;
  job_url: string | null;
  job_description: string | null;
  location: string | null;
  notes: string | null;
  job_type: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  pay_period: string | null;
  source: string | null;
  start_date: string | null;
  end_date: string | null;
  visa_sponsorship: string | null;
  academic_credit: boolean | null;
  status: string;
  priority: string;
  resume_version: string | null;
  cover_letter_ref: string | null;
  application_date: string | null;
  deadline: string | null;
  follow_up_date: string | null;
  interview_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type Reminder = {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  related_type: string | null;
  related_id: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  organization: string | null;
  position: string | null;
  contact_type: string | null;
  linkedin_url: string | null;
  website: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactLink = { id: string; entity_type: string; entity_id: string; label: string };
export type ContactDetail = Contact & { links: ContactLink[] };

export type Activity = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PublicationLink = { title: string; url: string };
export type RequiredDocument = { name: string; done: boolean };

export type Research = {
  id: string;
  title: string;
  organization: string;
  opportunity_type: string | null;
  country: string | null;
  department: string | null;
  laboratory: string | null;
  research_area: string | null;
  professor_name: string | null;
  professor_email: string | null;
  professor_website: string | null;
  description: string | null;
  eligibility: string | null;
  language_test_requirements: string | null;
  notes: string | null;
  website: string | null;
  application_url: string | null;
  funding_status: string;
  funding_amount: string | null;
  research_interests: string[];
  publication_links: PublicationLink[];
  required_documents: RequiredDocument[];
  status: string;
  application_date: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardSummary = {
  total_jobs: number;
  total_research: number;
  in_progress: number;
  interviews_scheduled: number;
  offers: number;
  rejected: number;
  upcoming_deadlines: number;
  pending_follow_ups: number;
  active_research_projects: number;
};

export type Deadline = {
  kind: "job_deadline" | "research_deadline" | "reminder" | "project_submission_deadline" | "project_milestone";
  id: string;
  title: string;
  /** A date ("YYYY-MM-DD") for job and research deadlines, a timestamp for reminders. */
  due: string;
  related_type: "job" | "research" | "contact" | "project" | null;
  related_id: string | null;
  /** Set for the two research project kinds, which link to the project page. */
  project_id?: string | null;
  project_title?: string | null;
};

/** An open submission deadline or milestone dated before today (`/dashboard/overdue-research`). */
export type OverdueResearch = {
  kind: "project_submission_deadline" | "project_milestone";
  id: string;
  title: string;
  /** "YYYY-MM-DD" */
  due: string;
  project_id: string;
  project_title: string;
};

export type StatusCount = { status: string; count: number };
export type MonthlyCount = { month: string; jobs: number; research: number };
export type Analytics = { job_status: StatusCount[]; research_status: StatusCount[]; monthly: MonthlyCount[] };

export type Project = {
  id: string;
  title: string;
  project_type: string;
  stage: string;
  topic: string | null;
  description: string | null;
  institution: string | null;
  notes: string | null;
  target_date: string | null;
  milestones_total: number;
  milestones_done: number;
  submissions_total: number;
  /** The earliest open submission deadline or milestone due date that is today or later. */
  next_deadline: string | null;
  /** True when an open submission deadline or milestone is dated before today. */
  has_overdue: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectSubmission = {
  id: string;
  project_id: string;
  venue_name: string;
  venue_type: string;
  venue_url: string | null;
  abstract_deadline: string | null;
  paper_deadline: string | null;
  /** When the abstract went in. Once set, the abstract deadline no longer counts as open. */
  abstract_submitted_on: string | null;
  notification_date: string | null;
  submitted_on: string | null;
  status: string;
  feedback: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMilestone = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
