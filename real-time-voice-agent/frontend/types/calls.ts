export interface CallWithUser {
  id: string;
  userId: string;
  userName: string;
  phoneNumber: string;
  startTime: string;   // ISO date string
  endTime?: string | null; // allow null as well as string
  status: "active" | "completed" | "failed";
}
