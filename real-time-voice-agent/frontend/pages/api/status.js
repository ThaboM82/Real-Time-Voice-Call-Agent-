export default function handler(req, res) {
  // Example response — replace with real backend logic later
  res.status(200).json({
    agentOnline: true,
    currentCall: "Customer #42",
    queueLength: 3
  });
}
