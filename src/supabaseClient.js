import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ypxujrjpapsoyesaeziv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlweHVqcmpwYXBzb3llc2Fleml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTY2MzEsImV4cCI6MjEwMzQ3MjYzMX0.qzLzOyY-ifL4BfAvRXhwYZ9abLojojaeDGzXDWOZ86E";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
