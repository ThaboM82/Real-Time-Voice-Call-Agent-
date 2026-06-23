import React, { useEffect, useState } from "react";
import axios from "axios";

function AppointmentsTable() {
  const [appointments, setAppointments] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:5000/api/appointments")
      .then(res => setAppointments(res.data.appointments))
      .catch(err => console.error("Error fetching appointments:", err));
  }, []);

  return (
    <div>
      <h2>Appointments</h2>
      <table border="1" cellPadding="8" style={{ width: "100%", marginTop: "10px" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Time</th>
            <th>Status</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map(appt => (
            <tr key={appt.id}>
              <td>{appt.id}</td>
              <td>{appt.title}</td>
              <td>{appt.time}</td>
              <td>{appt.status}</td>
              <td>{appt.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AppointmentsTable;
