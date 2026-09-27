PROCESS AND WORKFLOW

1. Add a feature that allows officials to return a process when something needs to be fixed, revised, corrected, or updated.

2. Add a Found Something Wrong report feature to every project or process page. Currently, this feature is only accessible inside the About section.

5. Review the current Protest page. There is already a Public Message feature, so the purpose of the Protest page is unclear. Remove it if it does not provide a separate necessary function.

ADMIN AND SYSTEM SETTINGS

1. Admin action buttons currently look like labels instead of clickable buttons. Improve their visual appearance. Based it on their function.

2. Automatic session logout duration should be customizable by the administrator, similar to the MFA duration settings.

3. Every table should have pagination with 10 records displayed per page by default.

4. The current header is too dark and too small. Improve its size, readability, and appearance. Make it green but not too green.

5. Make sure the administrator can view audit records for actions performed by all roles.

6. Create separate audit trail sections for Admin and HoPE.

7. One audit trail should focus on database and system activity.

8. Another audit trail should focus on actions performed by officials and users.

NOTIFICATIONS WARNINGS AND MESSAGES

1. Notifications should display meaningful messages instead of only showing a number.

2. Important notifications should be clearly visible so users can immediately understand what requires attention.

3. Warnings, messages, and notifications should not rely only on colored text.

4. Important warnings should clearly explain what happened, why it matters, and what action the user needs to take.

5. Use proper visual indicators for warning, information, success, and error messages.

BUTTONS AND ACTIONS

1. Some buttons currently use the same color even though they perform different actions.

2. Button colors should be based on their purpose.

3. Primary actions should have a clear and consistent style.

4. Warning actions should have a different style from normal actions.

5. Destructive actions should be visually different from normal actions.

6. Action buttons should look clearly clickable and should not appear like simple labels.

7. In tables and management pages, action buttons should normally be placed on the right side when appropriate.

8. The action buttons on the Invitation to Bid page should be redesigned because they currently look like labels.

9. Announcement action buttons should also be redesigned so they clearly appear interactive.

TABLES

1. Every large table should have pagination.

2. BAC Chair and Bids and Awards Committee observer pages currently do not have pagination.

3. Table contents should begin with capital letters where appropriate.

4. Table column widths should properly fit their contents.

5. Large tables should be responsive and should not overflow unnecessarily.

6. The Request for Quotation and Invitation to Bid Management table is too large and its contents do not fit properly.

7. Move table action buttons to the right side when appropriate.

8. The Reports table contents currently do not align properly with their columns.

9. Review all tables in the system for consistent spacing, alignment, pagination, and responsiveness.

USER INTERFACE AND VISUAL DESIGN


2. Add appropriate colors based on function and meaning instead of using green for almost everything.

3. Use consistent colors for success, warning, error, information, primary actions, secondary actions, and destructive actions.

4. Improve visual hierarchy so users can immediately identify important information and actions.

5. Avoid making every card, button, status, and interface element look visually similar.

6. Improve usability by using color purposefully instead of decoratively.

BUDGET UTILISATION MONITOR

1. The Budget Utilisation Monitor for HoPE contains too many cards and feels overwhelming. Not bad for many cards but if it can be organize properly its all goods, though if there any better solution, go for it.

2. The Budget Utilisation Monitor for the Budget Officer also contains too many cards.

3. Organize the information based on importance and priority.

4. Display the most important information first.

5. Reduce unnecessary cards where information can be combined.

6. Use sections, summaries, or tabs when necessary to reduce information overload.

7. Make it clear which information users should review first.



AUDIT TRAIL

1. The current Audit Trail focuses too much on database changes. Its okay, but it forget the ther important too.

2. The system should record important actions performed by every official and user.

3. Examples include approvals, rejections, returns for correction, submissions, updates, signatures, document uploads, account changes, and other important activities.

4. Admin should be able to view activity records from every role.

5. HoPE should also have access to relevant official activity records.

6. Separate database activity from user and official activity using tabs or separate sections.

7. Each audit record should clearly show the user, role, action, affected record, date, time, and result.

TRANSPARENCY PORTAL

1. Bidder eligibility details should also be available in the Transparency Portal when they are allowed to be publicly displayed. And their other information, but if its really private then dont.

2. Bidders are currently not clearly visible in the Transparency Portal.

3. Add an appropriate section for bidders participating in procurement activities.

4. Review which bidder information can legally and appropriately be displayed publicly.

5. Procurement information shown in the Transparency Portal should be complete and easy to understand.



DOCUMENT MANAGEMENT

1. Add a feature that allows users to upload an existing document template.

2. The system should be able to use the uploaded document layout as a template.

3. Users should be able to edit the document content inside the system while preserving the uploaded layout as much as possible.

4. Generated documents should follow the selected template.

5. Document editing should be easy to use and should not require users to recreate an existing document format manually.

REPORTS

1. Reports currently show similar or identical content across different roles.

2. Implement proper role separation for reports.

3. Each role should only see reports that are relevant to its responsibilities.

4. Reports should contain information appropriate to the user's role.

5. Fix Reports tables where contents do not properly match their columns.

6. Review report layouts for readability, alignment, filtering, pagination, and consistency.

ROLE SEPARATION

1. Different officials should not receive identical functions when their responsibilities are different.

2. Decision Support should be role specific.

3. Reports should be role specific.

4. Dashboards should prioritize information based on the user's responsibilities.

5. Actions, approvals, signatures, reports, notifications, and records should follow proper role permissions.

6. Review every role in the system to make sure responsibilities are properly separated.

PROFILE PAGES

1. Current profile pages look like unorganized information pages.

2. Redesign them into proper profile pages.

3. Organize personal information, role information, contact information, account settings, security settings, and activity information into clear sections.

4. Avoid displaying unrelated information in one large page.

5. Make profile pages consistent across roles while still showing role specific information when necessary.

LANDING PAGE OFFICIALS

1. Every official role in the system should appear in the Officials section of the landing page.

2. Make sure the list of officials is connected to the actual active officials registered in the system.

3. Display appropriate information such as name, role, position, and other public information when applicable.

4. Do not display private account information on the public landing page.

CONTRACTS AND ACCOUNTING

1. The Contracts page inside Accounting currently displays the message Contracts could not be loaded Check your connection and try again Retry.

2. Investigate why the Contracts page cannot load its data.

3. Determine whether the problem comes from the API, database query, permissions, missing records, server error, or frontend request.

4. Do not automatically show a connection error when the real problem may come from another source.

5. Display an error message that accurately explains what happened.

6. Add a Retry action when retrying can actually resolve the problem.

7. Record the technical error in the appropriate system logs for debugging.

ERROR HANDLING

1. Error messages should explain the actual problem instead of displaying generic messages whenever possible.

2. Do not show Check your connection unless the problem is actually related to connectivity.

3. Differentiate between network errors, server errors, permission errors, missing records, loading errors, and unexpected system errors.

4. Users should receive a simple understandable message.

5. Technical error details should be recorded in logs for administrators or developers.

6. Provide a Retry button only when retrying the request is useful.
