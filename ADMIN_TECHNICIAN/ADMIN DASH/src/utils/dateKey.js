// Shared by ServiceRequestsPage and ServiceHistoryPage's date filters so
// both pages match dates identically — a local (not UTC) YYYY-MM-DD key,
// same value shape an <input type="date"> produces.
export const localDateKey = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
