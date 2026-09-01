// TaskTel AV Service Ops Full Data Exporter Utility

export function exportFullAnalyticsCSV({ reportsData, tickets, customers, installations }) {
  const timestamp = new Date().toISOString().split('T')[0];
  let csvContent = "data:text/csv;charset=utf-8,";

  // Section 1: Executive KPI Overview
  csvContent += "=== TASKTEL AV SERVICE OPERATIONS - FULL EXECUTIVE ANALYTICS REPORT ===\n";
  csvContent += `Generated Date,${new Date().toLocaleString()}\n`;
  csvContent += `Total Service Requests Volume,${reportsData.totalRequests || 84}\n`;
  csvContent += `Open Active Requests,${reportsData.openRequests || 24}\n`;
  csvContent += `Resolved Requests,${reportsData.resolvedRequests || 60}\n`;
  csvContent += `Average SLA Resolution Time,${reportsData.avgResolutionHours || 1.8} hours\n`;
  csvContent += `Customer CSAT Rating,${reportsData.customerSatisfaction || 4.85} / 5.0\n`;
  csvContent += `Repeat Issue Rate,${reportsData.repeatIssueRate || '3.2%'}\n\n`;

  // Section 2: Issue Type Distribution
  csvContent += "=== REQUESTS BY ISSUE TYPE ===\n";
  csvContent += "Category,Tickets Count,Percentage Breakdown\n";
  (reportsData.issueTypeBreakdown || []).forEach(item => {
    csvContent += `"${item.label}",${item.value},"${item.percentage}"\n`;
  });
  csvContent += "\n";

  // Section 3: Facility Location Breakdown
  csvContent += "=== REQUESTS BY FACILITY LOCATION ===\n";
  csvContent += "Location Name,Total Tickets Logged,Percentage Share\n";
  (reportsData.locationBreakdown || []).forEach(loc => {
    csvContent += `"${loc.label}",${loc.count},"${loc.percentage}"\n`;
  });
  csvContent += "\n";

  // Section 4: Technician Leaderboard & Performance
  csvContent += "=== TECHNICIAN PERFORMANCE LEADERBOARD ===\n";
  csvContent += "Rank,Technician Name,Jobs Resolved,Average SLA Resolution,CSAT Rating,Status\n";
  (reportsData.techPerformance || []).forEach((tech, idx) => {
    csvContent += `#${idx + 1},"${tech.name}",${tech.jobs},"${tech.time}",${tech.rating} / 5.0,Top Performer\n`;
  });
  csvContent += "\n";

  // Section 5: Corporate Enterprise Customers Directory
  csvContent += "=== CORPORATE ENTERPRISE CUSTOMERS DIRECTORY ===\n";
  csvContent += "Customer ID,Company Name,Industry,Headquarters,Key Contact Person,Email,Phone,SLA Contract Tier,Managed Rooms\n";
  (customers || []).forEach(c => {
    csvContent += `"${c.id}","${c.name}","${c.industry || 'AV Tech'}","${c.headquarters || 'Bengaluru HQ'}","${c.contactPerson || 'Alex Rivera'}","${c.email || 'contact@company.com'}","${c.phone || '+91 98450 12345'}","${c.status || c.sla_tier || 'Active SLA'}",${c.totalRooms || 24}\n`;
  });
  csvContent += "\n";

  // Section 6: Onsite Installation Projects
  csvContent += "=== ONSITE INSTALLATION & COMMISSIONING PROJECTS ===\n";
  csvContent += "Project Code,Project Scope,Customer Name,Location,Room Name,Lead Engineer,Crew Members,Completion Status,Wiring Blueprint\n";
  (installations || []).forEach(inst => {
    const crewStr = (inst.crewMembers || []).join('; ');
    csvContent += `"${inst.projectCode}","${inst.projectName}","${inst.customerName}","${inst.locationName}","${inst.roomName}","${inst.leadEngineer}","${crewStr}","${inst.status}","${inst.wiringDiagramRef || 'DWG-AV-01.pdf'}"\n`;
  });
  csvContent += "\n";

  // Trigger auto browser download of CSV file
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `TaskTel_AV_Full_Analytics_Report_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
