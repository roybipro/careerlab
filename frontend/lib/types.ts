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
