# TaskTel Quotation Module -- Change Plan

## 1. Customer Details

-   Add a **Contact Person Name** field.
-   Add an **Account Manager** dropdown populated from the existing
    Sales Person list.
-   Automatically populate the selected account manager's contact
    number.

## 2. Quotation Header and Layout

-   Display the **Customer Logo** in the top-right corner instead of the
    "QUOTATION" label.
-   Move the **Summary** section to the beginning, before the detailed
    quotation.
-   Maintain a clean and consistent layout across all pages.

## 3. Subtotal and Grand Total

-   Show the relevant page-wise subtotal/value where required.
-   Add a **Grand Total** row directly below the Sub-total row at the
    end of the quotation.
-   Display the Grand Total only once. Do not repeat it on every page.

## 4. Editable Terms & Conditions

-   Add a **Terms & Conditions** option beside the **Pre-Installation**
    button.
-   Allow users to open and edit the Terms & Conditions.
-   Keep the delivery timeline editable.
-   Include the updated Terms & Conditions in the generated quotation
    PDF.

## 5. Quotation Approval Workflow

-   Add a **Submit for Approval** action after the quotation is
    completed.
-   Route submitted quotations to Admin (**Prakash Sir**) for review.
-   Allow Admin to view and modify the quotation, if required, before
    approving it.
-   Treat the quotation as approved/final only after Admin approval.

## 6. Excel Costing and Room-wise Margin

-   Remove the following fields from the Excel costing sheet:

    -   Margin
    -   Margin %
    -   Mode (Costing)

-   Calculate each room's margin using:

    **Room Margin = Amount − OSP Total**

-   Display only the total margin amount for each room, rather than
    individual item-level margins.

## 7. Separate Single-Item / Service Quotation Format

-   Create a separate quotation format based on the uploaded **TaskTel
    -- Dismantling & Re-Installation Proposal**.
-   Use this format only for single-product, single-item, dismantling
    and re-installation, or single-cable / individual-item quotations.
-   Keep it separate from the existing complete AV project / room-wise
    quotation format.

## 8. Signature

-   Remove the **Authorised Signature** section from the quotation PDF.

## 9. Replace the Notes Section

Replace the existing Notes with the following:

**NOTES:** 1. Civil and electrical works are not included in the
quotation and will be under the client's scope. 2. False ceiling cutting
and redoing work are not included and will be under the client's scope.
3. Raceway, conduiting and capping are not included. If required, these
will be charged extra at actuals. 4. All IT-related infrastructure,
including servers, thin clients and LAN cabling, will be under the
client's scope. 5. All cabling infrastructure will be charged at actuals
based on site requirements. 6. Equipment racks and enclosures are not
included. The client must provide suitable enclosures for equipment
installation. 7. The client must provide the required power points and
conduits/raceways for cable routing at the LED mounting locations. 8.
DTH connectivity will be under the client's scope.

## 10. Final PDF and Consistency

-   Ensure all revised fields, layout changes, totals, Terms &
    Conditions and Notes appear correctly in the generated PDF.
-   Maintain consistent formatting across all pages.
-   Retain the existing complete AV quotation format and add the
    single-item / service format as a separate option.

## Reference Files

-   Existing TaskTel Terms & Conditions PDF.
-   TaskTel -- Dismantling & Re-Installation Proposal (reference for the
    single-item / service quotation format).
-   Handwritten quotation feedback images supplied with this request.

## Implementation Note

Apply the changes to the quotation interface, costing/export logic and
PDF generation wherever relevant. Preserve existing quotation
functionality unless a change is specified.
