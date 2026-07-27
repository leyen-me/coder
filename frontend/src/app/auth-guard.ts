import { redirect } from "react-router-dom";

import { apiAuthStatus } from "@/lib/api/client";
import { paths } from "./paths";

/**
 * Route loader that checks authentication status.
 *
 * If the backend has `CODER_PASSWORD` set and the user is not authenticated,
 * redirects to `/login`. Otherwise proceeds normally.
 */
export async function authGuardLoader(): Promise<Response | null> {
  try {
    const status = await apiAuthStatus();
    if (!status.authenticated) {
      return redirect(paths.login);
    }
  } catch {
    // Network error or backend not reachable — redirect to login.
    return redirect(paths.login);
  }
  return null;
}
