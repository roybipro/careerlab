"use client";

import { ListSwitch, readSwitch } from "@/components/list-switch";
import { JOB_CATEGORIES } from "@/lib/enums";

/** The `category` URL value, or "" (All) for anything else. */
export function readCategory(value: string): string {
  return readSwitch(JOB_CATEGORIES, value);
}

/** All / Jobs / Internships. Kept in the URL as `category`; changing it goes back to page 1. */
export function CategorySwitch() {
  return <ListSwitch param="category" label="Category" options={JOB_CATEGORIES} />;
}
