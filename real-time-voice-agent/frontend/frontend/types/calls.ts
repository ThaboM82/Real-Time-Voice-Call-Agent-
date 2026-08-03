// frontend/types/calls.ts
export interface CallWithUser {
  id: string;
  userId: string;
  userName: string;
  phoneNumber: string;
  startTime: string;          // ISO string
  endTime: string | null;     // ISO string or null
  status: "active" | "completed"; // restrict to known values
}
