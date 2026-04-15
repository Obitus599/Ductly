"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Sample Server Action to verify Supabase type-safety is working.
 * Queries the teams table and returns all active teams.
 */
export async function getActiveTeams() {
  const supabase = await createClient();

  const { data: teams, error } = await supabase
    .from("teams")
    .select("*")
    .eq("active", true);

  if (error) {
    console.error("Error fetching teams:", error);
    return { teams: null, error: error.message };
  }

  return { teams, error: null };
}
