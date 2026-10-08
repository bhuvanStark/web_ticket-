// Admin → Reports (technician performance) HTTP calls. Only the Reports page
// imports this file. Read-only: /api/admin/tech-reports.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

const qs = ({ from, to }) => new URLSearchParams({ from, to }).toString();

export async function fetchTechReportOverview(range) {
  const res = await authFetch(`${API_BASE_URL}/admin/tech-reports/overview?${qs(range)}`, { headers: authHeaders() });
  return readApiData(res, 'load technician report');
}

export async function fetchTechReportDetail(technicianId, range) {
  const res = await authFetch(`${API_BASE_URL}/admin/tech-reports/technicians/${technicianId}?${qs(range)}`, { headers: authHeaders() });
  return readApiData(res, 'load technician details');
}
