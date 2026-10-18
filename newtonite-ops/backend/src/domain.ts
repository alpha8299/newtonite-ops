export const transitions: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["BLOCKED", "RESOLVED"],
  BLOCKED: ["IN_PROGRESS"],
  RESOLVED: ["OPEN"]
};
export function canTransition(from: string, to: string): boolean {
  return transitions[from]?.includes(to) ?? false;
}
export function canWrite(role: string): boolean {
  return role === "ADMIN" || role === "MEMBER";
}
export function canAdmin(role: string): boolean {
  return role === "ADMIN";
}
