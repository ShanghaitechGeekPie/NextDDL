export function isSubmittedStatus(status?: string | null): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "submitted";
}
