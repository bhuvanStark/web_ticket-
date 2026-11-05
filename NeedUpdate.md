# TaskPro -- Required UI & Module Updates

## 1. UI and General Module Updates

### 1.1 Role-Based Access Control (RBAC)

-   Ensure each user can access only the modules and features assigned
    to their role.
-   Restrict unauthorized pages, actions, and data access.
-   Apply the same role permissions consistently across the application.

### 1.2 Attendance Module

#### Sunday and Holiday Status

-   Display Sundays as **H -- Holiday**, not Absent.
-   Mark configured festival and public holidays (for example, Diwali
    and Pooja holidays) as **Holiday (H)** automatically.
-   Ensure holiday statuses are reflected correctly in attendance views
    and reports.

#### Leave Option

-   Add a **Leave** action in the Attendance Module.
-   On selection, open a popup with a leave-reason field and a Submit
    button.
-   After submission, update the employee's attendance status to
    **Leave**.
-   Show the updated status in attendance records and reports.

#### Half-Day Leave Option

-   Add a **Half-Day Leave** option for employees or authorized users.
-   Require a reason when submitting the request.
-   Display **Half-Day Leave** clearly in attendance records and
    reports.

### 1.3 Project Module

-   Fix the comment display issue where engineers' comments overlap.
-   Ensure comments are readable, properly spaced, and displayed in the
    correct order.
-   Remove dummy projects that are marked as completed.
-   Retain genuine project records.

### 1.4 API Polling and Page-Load Performance

The following API endpoints have been identified as continuously polling
at approximately one-second intervals:

-   `https://webticket-production.up.railway.app/api/service-requests`
-   `https://webticket-production.up.railway.app/api/projects`
-   `https://webticket-production.up.railway.app/api/admin/attendance?date=2026-10-29&card=absent&branch=Gurugram%20%2F%20Delhi%20NCR`

**Required actions:** - Review the polling logic for all three
endpoints. - Remove unnecessary one-second repeated requests. - Use an
appropriate refresh interval or event-based/data-fetching approach where
suitable. - Prevent duplicate polling when navigating between pages or
mounting components. - Stop polling when the relevant page or component
is no longer active. - Verify that page loading and overall application
performance improve without affecting data accuracy.

------------------------------------------------------------------------

## 2. Sales Module Updates

### 2.1 Lead Listing -- Sorting Order

-   Display the most recently created leads at the top of the list.
-   Show older leads below newer leads.
-   Apply consistent descending creation-date sorting across all pages
    of pagination.
-   Ensure sorting is handled at the data/query level so records do not
    appear in an inconsistent order between pages.

### 2.2 Stage-wise Lead Creation and Management

-   Allow sales users to create leads directly from the relevant
    sales-stage tabs.
-   Support adding multiple leads in one operation.
-   Ensure each lead is saved under the selected stage and appears in
    the correct stage list.

**Current stage-wise lead distribution provided for reference:**

  Stage         Lead Count
  ----------- ------------
  New                   10
  Meeting                5
  Proposal               2
  Follow-up              7
  On Hold                2
  Won                    1
  Dead                   8
  Lost                   8

### 2.3 Dedicated Funnel Tab

-   Add a separate **Funnel** tab in the Sales Module.
-   Provide an **Import** option to upload existing Excel pipeline data.
-   Provide an **Export** option to download the latest funnel records
    in Excel format.
-   Validate imported data and show clear success or error feedback.
-   Avoid creating duplicate records during repeated imports; provide an
    appropriate duplicate-check or update mechanism.

**Required Excel columns:**

  Company Name        Product         Value      Backup   Order Closed Remark
  ------------------- --------- ----------- ----------- -------------- ----------------------------
  Indiqube Altius     AV          14,50,000                            Under process
  Linxon Tower B      VC                      21,00,000                This month will get closed
  Indiqube Prestige   AV                                      7,85,500 Under process
  Armstrong Annex     AV                      13,20,000                This month will close
  Nag Interiors Hub   VC          32,50,000                            Under process

The Funnel should centralize company details, product categories, deal
values, backup amounts, order-closed values, and remarks instead of
maintaining separate Excel sheets.

### 2.4 Funnel Filters

Add filters similar to those available in the Ticketing System's Service
History section:

-   **Date-wise:** Filter by a specific date or date range.
-   **Salesperson-wise:** View records for an individual salesperson.
-   **Location-wise:** Filter by office or location.
-   **Product-wise:** Filter by product category, such as AV and EPABX.

**Filter behaviour:** - Allow filters to be used individually or
together. - Ensure the displayed records and exported data respect the
selected filters. - Provide a clear option to reset filters.

------------------------------------------------------------------------

## 3. Expected Outcome

### UI and General Modules

-   Correct role-based access across the application.
-   Accurate Sunday, holiday, leave, and half-day attendance statuses.
-   Readable project comments and removal of dummy completed projects.
-   Reduced unnecessary API polling and improved page-load performance.

### Sales Module

-   Latest leads consistently appear first across pagination.
-   Sales users can create and manage leads directly under the relevant
    stages.
-   A centralized Funnel tab supports Excel import and export.
-   Combined date, salesperson, location, and product filters support
    effective pipeline tracking and reporting.

## 4. Review and Validation

-   Test each update with the relevant user roles.
-   Verify attendance statuses in both the module and reports.
-   Confirm that polling is not occurring every second unnecessarily.
-   Test lead ordering across multiple pagination pages, including newly
    added leads.
-   Test stage-wise and multiple-lead creation.
-   Test Excel import, export, validation, and combined filters.
-   Confirm that existing records and workflows continue to function
    correctly.
