import type { ApiData } from "../api-client/client";

type Application = ApiData<"/applications", "get">["applications"][number];

// Plain words for each saved status. "rejected" is shown without the word.
export const STATUS_LABELS: Record<Application["status"], string> = {
  applied: "Applied",
  approved: "Approved",
  rejected: "Not approved",
};
