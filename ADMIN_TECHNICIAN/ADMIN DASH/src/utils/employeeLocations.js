// Sales & Back-Office Roles V1 — the fixed Branch/Location dropdown values,
// shared by the Technician, Sales, and Back-Office Add/Edit forms (plan
// §14: "Use the existing employee location field... No new branch
// master/table in V1"). Was previously a local constant only inside
// NewTechnicianModal.jsx; pulled out here so Sales/Back-Office reuse the
// exact same list rather than drifting from it.
export const EMPLOYEE_LOCATIONS = ['Bengaluru', 'Hyderabad', 'Chennai', 'Mumbai', 'Pune', 'Gurugram / Delhi NCR'];
