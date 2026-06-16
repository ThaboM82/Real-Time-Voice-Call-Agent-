import Link from "next/link";

export default function NavBar() {
  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "center",
        backgroundColor: "#1e1e1e",
        padding: "1rem",
        marginBottom: "2rem",
      }}
    >
      <Link
        href="/"
        style={{
          color: "#fff",
          textDecoration: "none",
          marginRight: "2rem",
          fontWeight: "bold",
        }}
      >
        🏠 Voice Agent
      </Link>
      <Link
        href="/transcripts"
        style={{
          color: "#fff",
          textDecoration: "none",
          marginRight: "2rem",
          fontWeight: "bold",
        }}
      >
        📜 Transcripts
      </Link>
      <Link
        href="/analytics"
        style={{
          color: "#fff",
          textDecoration: "none",
          fontWeight: "bold",
        }}
      >
        📊 Analytics
      </Link>

      <style jsx>{`
        nav a:hover {
          color: #00bcd4;
          text-decoration: underline;
        }
      `}</style>
    </nav>
  );
}
