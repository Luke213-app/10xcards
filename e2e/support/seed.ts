/**
 * Test-user + flashcard seeding for the e2e suite.
 *
 * - Test users are created through the Supabase **admin** API with
 *   `email_confirm: true`, so they can sign in immediately (no inbox round-trip).
 *   Creation is idempotent: an already-existing account is looked up instead.
 * - Flashcards are seeded with a **service_role** supabase-js client and an
 *   **explicit `user_id`**. Under service_role `auth.uid()` is null, so the
 *   `user_id` default would fail and RLS is bypassed — exactly what we want for
 *   planting another user's row (R#1).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_API_URL, SUPABASE_SERVICE_ROLE_KEY, USER_A, USER_B } from "./local-supabase";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface SeededFlashcard {
  id: string;
  front: string;
  back: string;
  source: string;
}

let serviceClient: SupabaseClient | null = null;

/** Lazily-built service_role client (RLS bypass; no session persistence). */
function admin(): SupabaseClient {
  serviceClient ??= createClient(SUPABASE_API_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

const adminAuthHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/** Find an existing auth user id by email via the admin list endpoint. */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: adminAuthHeaders,
  });
  if (!res.ok) {
    throw new Error(`admin list users failed: ${res.status.toString()} ${await res.text()}`);
  }
  const body = (await res.json()) as { users: { id: string; email?: string }[] };
  return body.users.find((u) => u.email === email)?.id ?? null;
}

/** Create a confirmed auth user, or return the id of the existing one (idempotent). */
async function createOrFetchUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminAuthHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (res.ok) {
    const user = (await res.json()) as { id: string };
    return user.id;
  }

  // Already exists (admin API returns 422 for a duplicate email) → look it up.
  if (res.status === 422 || res.status === 409) {
    const existing = await findUserIdByEmail(email);
    if (existing) return existing;
  }

  throw new Error(`admin create user failed for ${email}: ${res.status.toString()} ${await res.text()}`);
}

/** Ensure both fixed test accounts exist and are confirmed; returns them with ids. */
export async function ensureTestUsers(): Promise<{ a: TestUser; b: TestUser }> {
  const [aId, bId] = await Promise.all([
    createOrFetchUser(USER_A.email, USER_A.password),
    createOrFetchUser(USER_B.email, USER_B.password),
  ]);
  return {
    a: { id: aId, ...USER_A },
    b: { id: bId, ...USER_B },
  };
}

/** Seed a flashcard owned by `userId` (service_role + explicit user_id). */
export async function seedFlashcard(
  userId: string,
  card: { front: string; back: string; source?: string },
): Promise<SeededFlashcard> {
  const { data, error } = await admin()
    .from("flashcards")
    .insert({ user_id: userId, front: card.front, back: card.back, source: card.source ?? "manual" })
    .select("id, front, back, source")
    .single();

  if (error) {
    throw new Error(`seedFlashcard failed: ${error.message}`);
  }
  return data;
}

/** Read a flashcard by id with service_role (RLS bypass) — null if absent. */
export async function getFlashcard(id: string): Promise<SeededFlashcard | null> {
  const { data, error } = await admin().from("flashcards").select("id, front, back, source").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getFlashcard failed: ${error.message}`);
  }
  return data ?? null;
}

/** Remove a test user (and, by cascade, their flashcards). Used for signup-case cleanup. */
export async function deleteUserByEmail(email: string): Promise<void> {
  const id = await findUserIdByEmail(email);
  if (!id) return;
  const res = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: adminAuthHeaders,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`admin delete user failed for ${email}: ${res.status.toString()} ${await res.text()}`);
  }
}
