import AnalyticsOverview from "@components/AnalyticsOverview";
import TranscriptSummary from "@components/TranscriptSummary";
import AppointmentsTable from "@components/AppointmentsTable";

export default function HomePage() {
  return (
    <main>
      <h1>Welcome to Real-Time Voice Agent</h1>
      <p>This is your Next.js App Router homepage.</p>

      <section>
        <h2>Analytics</h2>
        <AnalyticsOverview />
      </section>

      <section>
        <h2>Recent Transcripts</h2>
        <TranscriptSummary />
      </section>

      <section>
        <h2>Upcoming Appointments</h2>
        <AppointmentsTable />
      </section>
    </main>
  );
}
