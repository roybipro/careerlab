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
