# Requirements Document

## Introduction

This document defines the requirements for the **Yeshi Clothe Admin Dashboard** — a new standalone React application (`cloth_admin/`) that enables the sole administrator to manage all aspects of the Yeshi Clothe e-commerce platform. The admin dashboard shares the existing Node.js/Express backend (hosted on Render), Firebase Firestore database, Firebase Authentication, and Firebase Storage with the existing customer website (`cloth_frontend/`). It is deployed as a separate Vercel application with its own domain.

The admin dashboard covers order management, payment approval, customer management, product and category management, inventory tracking, analytics, real-time notifications (dashboard bell, SMS via AfroMessage, and email), and site settings.

---

## Glossary

- **Admin_Dashboard**: The standalone React application at `cloth_admin/` that provides administrative control over the Yeshi Clothe platform.
- **Admin**: The single authorised user whose Firebase Authentication email is `hailetadilo@gmail.com`.
- **Backend_API**: The existing Node.js/Express server hosted at `https://myclothe.app.aletcloud.com`.
- **Firebase_Auth**: Firebase Authentication service used for Google Sign-In and session management in both the customer site and the Admin_Dashboard.
- **Firestore**: Firebase Cloud Firestore, the shared NoSQL database for all platform data.
- **Firebase_Storage**: Firebase Storage bucket shared between the customer site and the Admin_Dashboard.
- **Customer_Site**: The existing React frontend at `cloth_frontend/`, served at `https://www.yeshiclothe.com.et`.
- **Order**: A customer purchase record stored in Firestore, containing items, customer info, payment status, and sewing/shipping status.
- **Order_Status**: The public-facing lifecycle state of an Order as seen by the customer: `Pending → Payment Submitted → Payment Approved → Preparing Order → Shipped → Delivered`.
- **Payment_Proof**: A screenshot or image file uploaded by the customer as evidence of manual payment (bank transfer or Telebirr).
- **SMS_Service**: The AfroMessage SMS gateway (https://app.afromessage.com) used to deliver SMS alerts to the Admin phone (+251933797981).
- **Email_Service**: The nodemailer-based email service already configured in the Backend_API for transactional emails to customers and the Admin.
- **Notification**: An in-app alert record stored in Firestore (`notifications` collection) associated with a specific user (Admin or customer).
- **Product**: A catalogue item stored in Firestore, managed exclusively by the Admin.
- **Category**: A product grouping label stored in Firestore, managed exclusively by the Admin.
- **Inventory**: The stock-level data for each Product, stored as a field within the Product document in Firestore.
- **Analytics**: Aggregated business metrics derived from Order, Customer, and Product data.
- **AfroMessage_API**: The HTTP REST API provided by AfroMessage for sending SMS messages.
- **JWT_Token**: A JSON Web Token issued by the Backend_API after successful authentication, used to authorise subsequent API requests.
- **Admin_Route**: Any URL path within the Admin_Dashboard that requires the Admin to be authenticated and authorised.
- **Dark_Mode / Light_Mode**: A user-selectable UI theme preference persisted in `localStorage`.

---

## Requirements

---

### Requirement 1: Admin Authentication via Google Sign-In

**User Story:** As the Admin, I want to sign in using my Google account so that I can securely access the dashboard without managing a separate password.

#### Acceptance Criteria

1. IF a visitor accesses any Admin_Route without being authenticated, THEN THE Admin_Dashboard SHALL redirect them to the login page, which is the sole entry point for unauthenticated visitors.
2. WHEN the Admin clicks "Sign in with Google", THE Admin_Dashboard SHALL initiate a Firebase Google Sign-In OAuth flow using the shared Firebase project credentials.
3. WHEN Google Sign-In completes successfully, THE Admin_Dashboard SHALL retrieve the authenticated user's email from Firebase_Auth.
4. IF the authenticated email is not `hailetadilo@gmail.com`, THEN THE Admin_Dashboard SHALL sign the user out of Firebase_Auth, display an "Access Denied" message, and redirect to the login page.
5. IF the authenticated email equals `hailetadilo@gmail.com`, THEN THE Admin_Dashboard SHALL exchange the Firebase ID token for a Backend_API JWT_Token by calling `POST /api/auth/google` on the Backend_API.
6. WHEN a JWT_Token is received from `POST /api/auth/google`, THE Admin_Dashboard SHALL store it in `localStorage` under the key `adminToken` and navigate the Admin to the Dashboard Home.
7. IF `POST /api/auth/google` returns a non-200 response or a network error occurs, THEN THE Admin_Dashboard SHALL sign the user out of Firebase_Auth, display the error message returned by the Backend_API (or "Authentication failed" if no message is available), and redirect to the login page.
8. WHILE the Admin is authenticated, THE Admin_Dashboard SHALL attach the JWT_Token as the `x-auth-token` header on all Backend_API requests.
9. WHEN the Backend_API returns HTTP 401 on any request, THE Admin_Dashboard SHALL silently attempt to refresh the Firebase ID token via the Firebase SDK and re-exchange it for a new JWT_Token by calling `POST /api/auth/google` exactly once, then retry the original request with the new token; IF the re-exchange also fails, THEN THE Admin_Dashboard SHALL sign the Admin out of Firebase_Auth, remove `adminToken` from `localStorage`, and redirect to the login page.
10. WHEN the Admin clicks "Sign Out", THE Admin_Dashboard SHALL sign out of Firebase_Auth, remove `adminToken` from `localStorage`, and redirect to the login page.
11. THE Admin_Dashboard SHALL protect every Admin_Route by checking `adminToken` presence; IF `adminToken` is absent from `localStorage` or is a JWT whose expiry (`exp` claim) is in the past, THEN THE Admin_Dashboard SHALL redirect the visitor to the login page without making any Backend_API request.

---

### Requirement 2: Dashboard Home Overview

**User Story:** As the Admin, I want a home screen summarising key business metrics so that I can quickly assess the state of the store at a glance.

#### Acceptance Criteria

1. WHEN the Admin navigates to Dashboard Home, THE Admin_Dashboard SHALL fetch summary statistics from `GET /api/orders/stats`, `GET /api/products/stats`, and `GET /api/analytics/user-activity` on the Backend_API.
2. THE Admin_Dashboard SHALL display the following KPI cards: Total Orders (all-time count), Pending Orders (orders with `payment_status: "pending"`), Revenue (sum of amounts for orders with `payment_status: "confirmed"`, in ETB), Monthly Sales (total ETB value of confirmed-payment orders whose `createdAt` falls within the current calendar month from the 1st to the last day), New Customers (users registered in the last 30 days), and Low Stock Products (products where `stockQuantity ≤ low_stock_threshold` and `unlimitedStock` is false).
3. THE Admin_Dashboard SHALL render a monthly revenue bar chart using data from `GET /api/analytics/user-activity`, showing ETB revenue on the Y-axis and month labels on the X-axis for the last 12 months; IF data for any month is absent from the response, THEN THE Admin_Dashboard SHALL plot that month with a value of zero.
4. THE Admin_Dashboard SHALL render a top-5 products list using the `orderedProducts` field from `GET /api/analytics/user-activity`, ordered by all-time confirmed order count descending.
5. WHEN the Admin clicks a KPI card, THE Admin_Dashboard SHALL navigate to: Total Orders → Orders section (no filter), Pending Orders → Orders section filtered by `payment_status: "pending"`, Revenue → Payments section, Monthly Sales → Payments section filtered to current month, New Customers → Customers section sorted by registration date descending, Low Stock → Inventory section filtered to low-stock items.
6. WHEN data is loading, THE Admin_Dashboard SHALL display skeleton placeholder loaders in place of all KPI cards, the revenue chart, and the top-5 products list.
7. IF any Backend_API request returns a non-2xx status or times out after 10 seconds, THEN THE Admin_Dashboard SHALL display an inline error message on the affected widget with a "Retry" button, without hiding successfully loaded widgets.
8. THE Admin_Dashboard SHALL auto-refresh all Dashboard Home widgets every 60 seconds while the Dashboard Home section is active.

---

### Requirement 3: Order Management — Viewing and Searching

**User Story:** As the Admin, I want to view, search, and filter all customer orders so that I can efficiently locate and act on any order.

#### Acceptance Criteria

1. WHEN the Admin opens the Orders section, THE Admin_Dashboard SHALL fetch orders from `GET /api/orders` on the Backend_API and display them in a paginated table of 20 rows per page, sorted by `createdAt` descending (newest first); WHEN the page loads, THE Admin_Dashboard SHALL display skeleton rows until the response arrives.
2. THE Admin_Dashboard SHALL display the following columns per order row: Order ID, Customer Name, Item Description, Quantity, Total (ETB), Order Status, Payment Status, and Order Date.
3. WHEN the Admin types in the search field, THE Admin_Dashboard SHALL filter the visible order list client-side by Order ID, customer name, or phone number, updating results within 300 ms of the last keystroke using debounce.
4. WHEN the Admin selects a status filter from the dropdown, THE Admin_Dashboard SHALL display only orders whose `Order_Status` matches one of: `Pending`, `Payment Submitted`, `Payment Approved`, `Preparing Order`, `Shipped`, `Delivered`, or `Cancelled`.
5. WHEN the Admin clicks an order row, THE Admin_Dashboard SHALL open an Order Detail panel showing: customer info, delivery address, cloth details, measurements, Payment_Proof image (if uploaded), payment method, negotiation messages, and the full status history in chronological order.
6. THE Admin_Dashboard SHALL display the Payment_Proof image by fetching it from the Backend_API using the authenticated upload URL with the JWT_Token appended as `?token=` query parameter; IF no Payment_Proof exists, THE Admin_Dashboard SHALL display a "No proof uploaded" placeholder.
7. WHILE the Orders section is open, THE Admin_Dashboard SHALL auto-refresh the order list every 30 seconds, preserving the current page number, active search text, and status filter during the refresh.
8. IF the initial `GET /api/orders` request returns a non-2xx status or times out after 10 seconds, THEN THE Admin_Dashboard SHALL display an error message and a "Retry" button instead of the table.
9. THE Admin_Dashboard SHALL display pagination controls (previous, next, and page numbers) below the table; WHEN the Admin clicks a page control, THE Admin_Dashboard SHALL scroll to the top of the table and fetch the corresponding page.

---

### Requirement 4: Order Management — Status Transitions

**User Story:** As the Admin, I want to update order statuses through the defined lifecycle so that customers always see accurate progress on their orders.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL enforce the Order_Status flow: `Pending → Payment Submitted → Payment Approved → Preparing Order → Shipped → Delivered`; THE Admin_Dashboard SHALL only display action buttons valid for the order's current status and SHALL NOT render action buttons that would violate this sequence.
2. WHEN the Admin clicks "Approve Payment" on an order in `Payment Submitted` status, THE Admin_Dashboard SHALL optimistically update the displayed status to `Payment Approved`, then call `PUT /api/orders/:id/payment` on the Backend_API with `{ status: "confirmed" }`.
3. WHEN the Admin clicks "Reject Payment" on an order in `Payment Submitted` status, THE Admin_Dashboard SHALL display a modal requiring the Admin to enter a non-empty rejection reason (maximum 500 characters), then call `PUT /api/orders/:id/payment` with `{ status: "rejected", reason: "<text>" }`, and update the displayed status to `Pending`.
4. WHEN the Admin clicks "Mark as Processing" on an order in `Payment Approved` status, THE Admin_Dashboard SHALL call `PUT /api/orders/:id/status` with `{ step: "sewing" }` on the Backend_API and update the displayed status to `Preparing Order`.
5. WHEN the Admin clicks "Mark as Shipped" on an order in `Preparing Order` status, THE Admin_Dashboard SHALL display a modal requiring the Admin to enter a non-empty tracking note (maximum 500 characters), then call `PUT /api/orders/:id/status` with `{ step: "shipped", note: "<text>" }`, and update the displayed status to `Shipped`.
6. WHEN the Admin clicks "Mark as Delivered" on an order in `Shipped` status, THE Admin_Dashboard SHALL call `PUT /api/orders/:id/status` with `{ step: "delivered" }` and update the displayed status to `Delivered`.
7. WHEN the Admin clicks "Cancel Order" on an order in any status except `Delivered`, THE Admin_Dashboard SHALL display a confirmation dialog; WHEN confirmed, THE Admin_Dashboard SHALL call `DELETE /api/orders/:id/cancel` on the Backend_API and update the displayed status to `Cancelled`.
8. WHEN any status transition API call succeeds, THE Admin_Dashboard SHALL write the new status to the corresponding Firestore Order document so that the Customer_Site reflects the change without requiring a backend poll.
9. IF any status transition request returns a non-2xx response or a network error, THEN THE Admin_Dashboard SHALL revert the optimistic UI update to the previous status and display the error message returned by the Backend_API (or "Request failed" if no message is available).

---

### Requirement 5: Order Management — Invoice Printing

**User Story:** As the Admin, I want to print a formatted invoice for any order so that I can provide physical documentation to customers.

#### Acceptance Criteria

1. WHEN the Admin clicks "Print Invoice" in the Order Detail panel, THE Admin_Dashboard SHALL render a print-ready invoice view containing: order ID, order date formatted as `DD/MM/YYYY`, customer full name, delivery address, an itemised table of products (name, quantity, unit price in ETB, line total in ETB), shipping cost in ETB, and order total in ETB.
2. THE Admin_Dashboard SHALL apply a `@media print` stylesheet that sets all non-invoice elements (sidebar, header, action buttons, breadcrumbs) to `display: none`, leaving only the invoice content visible in the printed output.
3. THE Admin_Dashboard SHALL include the "Yeshi Clothe" store name and logo image in the invoice header, positioned above the order details.
4. WHEN the invoice view is rendered, THE Admin_Dashboard SHALL automatically invoke `window.print()` so the browser print dialog opens without requiring an additional click.
5. IF required order data (customer name, items, total) is missing or null, THEN THE Admin_Dashboard SHALL display "N/A" for the missing field rather than leaving it blank or throwing a rendering error.
6. THE Admin_Dashboard SHALL format all monetary values on the invoice using comma-separated thousands and two decimal places (e.g., "1,250.00 ETB").
7. THE Admin_Dashboard SHALL insert a CSS `page-break-after: avoid` rule on the invoice header so that the store name and logo are never split across a printed page boundary.

---

### Requirement 6: Customer Management

**User Story:** As the Admin, I want to view and manage customer accounts so that I can support customers and enforce platform policies.

#### Acceptance Criteria

1. WHEN the Admin opens the Customers section, THE Admin_Dashboard SHALL fetch registered users from `GET /api/admin/users` on the Backend_API and display them in a paginated table of 20 rows per page, showing: name, email, phone, registration date, order count, and account status.
2. WHEN the Admin types in the customer search field, THE Admin_Dashboard SHALL filter the customer list client-side by name, email, or phone number within 300 ms of the last keystroke using debounce.
3. WHEN the Admin clicks a customer row, THE Admin_Dashboard SHALL display a Customer Detail panel showing profile information, address, and a chronological list (newest first) of that customer's orders fetched from `GET /api/orders?userId=:id` on the Backend_API.
4. WHEN the Admin clicks "Block Customer" on an account whose status is not `banned`, THE Admin_Dashboard SHALL call `PUT /api/admin/users/:id/status` with `{ status: "banned" }` on the Backend_API and, on success, display the account status as "Blocked" in the table; THE Admin_Dashboard SHALL NOT display a "Block Customer" button for the Admin's own account (`hailetadilo@gmail.com`).
5. WHEN the Admin clicks "Unblock Customer" on a blocked account, THE Admin_Dashboard SHALL call `PUT /api/admin/users/:id/status` with `{ status: "active" }` on the Backend_API and, on success, display the account status as "Active".
6. IF a block or unblock request returns a non-2xx response or a network error, THEN THE Admin_Dashboard SHALL display the Backend_API error message (or "Request failed" if none is provided) and leave the account status unchanged in the table.

---

### Requirement 7: Product Management

**User Story:** As the Admin, I want to create, edit, and delete products so that the product catalogue stays current and accurate.

#### Acceptance Criteria

1. WHEN the Admin opens the Products section, THE Admin_Dashboard SHALL fetch all products from `GET /api/products` on the Backend_API and display them in a grid showing: thumbnail image, title, price (ETB), stock quantity, enabled/disabled status, and discount percentage.
2. WHEN the Admin clicks "Add Product", THE Admin_Dashboard SHALL open a product form with the following field constraints: title (1–200 characters, required), description (1–5000 characters, required), price (numeric, 0.01–999999.99 ETB, required), shipping price (numeric, 0–999999.99 ETB), free-shipping toggle (boolean), stock quantity (integer 0–999999), unlimited stock toggle (boolean), categories (multi-select from existing category list), discount percentage (integer 0–100), enabled toggle (boolean, default true), and up to 10 image files.
3. WHEN the Admin submits the Add Product form, THE Admin_Dashboard SHALL call `POST /api/products` on the Backend_API with the form data as `multipart/form-data`, attaching image files under the `images` field.
4. WHEN the Admin clicks "Edit" on an existing product, THE Admin_Dashboard SHALL pre-populate the product form with the current product data and submit changes via `PUT /api/products/:id` on the Backend_API.
5. WHEN the Admin toggles the enabled/disabled switch on a product and the `PUT /api/products/:id` call succeeds, THE Admin_Dashboard SHALL immediately update the product card to reflect the new `isActive` state; IF the call fails, THEN THE Admin_Dashboard SHALL revert the switch to its previous position and display the Backend_API error message.
6. WHEN the Admin clicks "Delete" on a product, THE Admin_Dashboard SHALL display a confirmation dialog; WHEN confirmed, THE Admin_Dashboard SHALL call `DELETE /api/products/:id` on the Backend_API and remove the product card from the grid only on a 2xx response.
7. WHEN a product form submission returns a non-2xx response, THE Admin_Dashboard SHALL display field-level validation errors returned by the Backend_API adjacent to the relevant fields without closing the form; IF the error is not field-specific, THE Admin_Dashboard SHALL display a general error banner at the top of the form.
8. THE Admin_Dashboard SHALL support setting a discount percentage (0–100) per product; WHEN a discount greater than 0 is set, THE Admin_Dashboard SHALL display the original price with a CSS `text-decoration: line-through` style and the discounted price (original × (1 − discount/100)) in a visually distinct colour.

---

### Requirement 8: Category Management

**User Story:** As the Admin, I want to manage product categories so that customers can browse organised product groups.

#### Acceptance Criteria

1. WHEN the Admin opens the Categories section, THE Admin_Dashboard SHALL fetch the distinct category values from `GET /api/products/categories` on the Backend_API and display them in a list showing each category name and the count of products that include that category string.
2. WHEN the Admin clicks "Add Category", THE Admin_Dashboard SHALL display an inline form with a text input (1–100 characters, unique, required); WHEN submitted, THE Admin_Dashboard SHALL call `POST /api/products/categories` on the Backend_API with `{ name: "<text>" }`; IF the endpoint does not exist, THE Admin_Dashboard SHALL display a "Category creation not supported by current API" message and disable the Add button.
3. WHEN the Admin edits a category name and submits the change, THE Admin_Dashboard SHALL call `PUT /api/products/categories/:oldName` with `{ name: "<newName>" }` on the Backend_API; WHEN the call succeeds, THE Admin_Dashboard SHALL update the category name in the list and display the new product count.
4. WHEN the Admin clicks "Delete" on a category that has one or more associated products, THE Admin_Dashboard SHALL display a confirmation warning stating the number of affected products; WHEN confirmed, THE Admin_Dashboard SHALL call `DELETE /api/products/categories/:name` on the Backend_API; IF the call fails, THE Admin_Dashboard SHALL display the error and leave the category list unchanged.
5. IF any category management request returns a non-2xx response, THEN THE Admin_Dashboard SHALL display the Backend_API error message inline and leave the category list unchanged.

---

### Requirement 9: Inventory Management

**User Story:** As the Admin, I want to monitor and adjust product stock levels so that customers cannot order out-of-stock items.

#### Acceptance Criteria

1. WHEN the Admin opens the Inventory section, THE Admin_Dashboard SHALL display all products with their current `stockQuantity`, `unlimitedStock` flag, and a low-stock warning icon (⚠) for products where `unlimitedStock` is false and `stockQuantity ≤ 5`.
2. WHEN the Admin edits a stock quantity field inline and presses Enter or clicks "Save", THE Admin_Dashboard SHALL validate that the value is an integer in the range 0–999999, then call `PUT /api/products/:id` with `{ stockQuantity: <integer> }` on the Backend_API; IF the call fails, THE Admin_Dashboard SHALL revert the field to its previous value and display the error message.
3. WHEN the Admin toggles the unlimited-stock switch to enabled, THE Admin_Dashboard SHALL call `PUT /api/products/:id` with `{ unlimitedStock: true }` on the Backend_API; on success, THE Admin_Dashboard SHALL hide the numeric stock field and display "∞" in its place and remove any low-stock warning icon; WHEN toggled to disabled, THE Admin_Dashboard SHALL call `PUT /api/products/:id` with `{ unlimitedStock: false }`, re-display the numeric stock field with the current `stockQuantity`, and re-apply the low-stock icon if applicable; IF either call fails, THE Admin_Dashboard SHALL revert the switch and display the error message.
4. WHEN the Inventory section loads or a stock save completes, THE Admin_Dashboard SHALL update the low-stock badge on the Inventory navigation item to reflect the current count of products where `unlimitedStock` is false and `stockQuantity ≤ 5`.
5. IF the initial fetch of products for the Inventory section returns a non-2xx status or times out after 10 seconds, THEN THE Admin_Dashboard SHALL display an error message and a "Retry" button instead of the product list.

---

### Requirement 10: Payment Management

**User Story:** As the Admin, I want a dedicated payments view so that I can reconcile all financial transactions.

#### Acceptance Criteria

1. WHEN the Admin opens the Payments section, THE Admin_Dashboard SHALL fetch payment records from `GET /api/payments` on the Backend_API and display them in a paginated table of 20 rows per page, sorted by `createdAt` descending, with columns: transaction reference, customer name, amount (ETB), payment method, status (`pending` | `success` | `failed` | `cancelled`), and date formatted as `YYYY-MM-DD HH:mm`.
2. THE Admin_Dashboard SHALL provide a status filter dropdown with options: All, `pending`, `success`, `failed`, `cancelled`; and a date range picker limited to the last 12 months; WHEN either filter changes, THE Admin_Dashboard SHALL re-fetch the payment list with the selected criteria applied as query parameters.
3. WHEN the Admin clicks a payment row, THE Admin_Dashboard SHALL display the linked Order Detail panel by fetching `GET /api/orders/:orderId` using the `orderId` field on the payment record; IF no linked order exists (`orderId` is null or the fetch returns 404), THE Admin_Dashboard SHALL display a "No linked order found" message instead of the Order Detail panel.
4. THE Admin_Dashboard SHALL display a revenue summary banner at the top of the Payments section showing for the current calendar month (1st to last day): total `success` payments in ETB, total `pending` payments in ETB, and total `failed` payments in ETB, fetched from `GET /api/payments/summary?month=<YYYY-MM>` on the Backend_API.

---

### Requirement 11: Analytics Dashboard

**User Story:** As the Admin, I want visualised analytics so that I can identify trends and make informed business decisions.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL fetch analytics data from `GET /api/analytics/user-activity` and order statistics from `GET /api/orders/stats` on the Backend_API.
2. THE Admin_Dashboard SHALL render a line chart showing daily order count for the last 30 days.
3. THE Admin_Dashboard SHALL render a bar chart showing monthly revenue (ETB) for the last 12 months.
4. THE Admin_Dashboard SHALL display a ranked list of the top 5 products by confirmed order count.
5. THE Admin_Dashboard SHALL display new customer registrations per week for the last 8 weeks.
6. THE Admin_Dashboard SHALL display current inventory status: in-stock product count, low-stock product count (≤ 5 units), and out-of-stock count (0 units with unlimited stock off).
7. WHEN the Admin selects a date range filter, THE Admin_Dashboard SHALL re-fetch and re-render all chart widgets to reflect the selected period.
8. THE Admin_Dashboard SHALL display all monetary values in ETB with comma-separated thousands (e.g., "12,500 ETB").

---

### Requirement 12: Real-Time In-App Notifications

**User Story:** As the Admin, I want a notification bell in the dashboard header so that I am immediately alerted to important events without refreshing the page.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a notification bell icon in the header with an unread badge showing the count of unread Notification records for the Admin.
2. THE Admin_Dashboard SHALL poll `GET /api/notifications` (or equivalent Backend_API endpoint) every 15 seconds to check for new Notification records.
3. WHEN the Admin clicks the notification bell, THE Admin_Dashboard SHALL display a dropdown list of the 20 most recent notifications, each showing: title, body, and relative timestamp (e.g., "2 min ago").
4. WHEN the Admin clicks a notification item, THE Admin_Dashboard SHALL navigate to the related order or section and call the Backend_API to mark that notification as read.
5. WHEN the Admin clicks "Mark all as read", THE Admin_Dashboard SHALL call the Backend_API bulk-mark-read endpoint and reset the unread badge to 0.
6. THE Admin_Dashboard SHALL trigger a new in-app notification fetch immediately upon the following events: new order received, payment proof uploaded, payment approved, payment rejected, order shipped, order delivered, and new customer registration.
7. THE Admin_Dashboard SHALL display a notification history page accessible from the notification dropdown showing all notifications with read/unread state and timestamps.

---

### Requirement 13: SMS Notifications via AfroMessage

**User Story:** As the Admin, I want SMS alerts sent to my phone for critical events so that I am notified even when the dashboard is not open.

#### Acceptance Criteria

1. THE Backend_API SHALL send an SMS to the Admin phone number `+251933797981` via the AfroMessage_API for the following events: new order received, payment proof submitted by customer, payment approved by Admin, payment rejected by Admin, and order marked as Shipped.
2. THE Backend_API SHALL call the AfroMessage_API using credentials stored in environment variables (`AFROMESSAGE_API_KEY`, `AFROMESSAGE_SENDER_ID`) so that keys can be rotated without code changes.
3. THE Backend_API SMS integration SHALL be encapsulated in a standalone service module (e.g., `services/smsService.js`) so that the AfroMessage provider can be swapped without modifying order or payment controllers.
4. IF an AfroMessage_API call returns a non-2xx response or throws a network error, THEN THE Backend_API SHALL log the failure, fall back to sending an email notification to the Admin email address, and continue processing the triggering request without returning an error to the caller.
5. THE Backend_API SHALL include the order ID and customer name in every SMS message body to allow the Admin to identify the related order.

---

### Requirement 14: Email Notifications

**User Story:** As the Admin and customers, we want email notifications for key order events so that all parties are kept informed via their inbox.

#### Acceptance Criteria

1. WHEN an order is created, THE Backend_API SHALL send an order confirmation email to the customer's registered email address containing: order ID, item list, total amount in ETB, and estimated next steps.
2. WHEN payment is approved, THE Backend_API SHALL send a payment approval email to the customer confirming the payment has been received and the order is progressing.
3. WHEN payment is rejected, THE Backend_API SHALL send a payment rejection email to the customer including the rejection reason provided by the Admin.
4. WHEN an order status changes to `Shipped`, THE Backend_API SHALL send a shipping notification email to the customer including any tracking note provided by the Admin.
5. WHEN an order status changes to `Delivered`, THE Backend_API SHALL send a delivery confirmation email to the customer.
6. IF an outgoing email fails to deliver, THEN THE Backend_API SHALL log the error and continue processing without returning an error to the caller.

---

### Requirement 15: Settings Management

**User Story:** As the Admin, I want to manage site settings from the dashboard so that I can update delivery rules, social links, and content without touching code.

#### Acceptance Criteria

1. WHEN the Admin opens the Settings section, THE Admin_Dashboard SHALL fetch current settings from `GET /api/settings/delivery`, `GET /api/settings/social`, and `GET /api/settings/content` on the Backend_API and render them in editable form fields.
2. WHEN the Admin saves delivery settings, THE Admin_Dashboard SHALL call `PUT /api/settings/delivery` with the updated delivery mode and country list on the Backend_API.
3. WHEN the Admin saves social link settings, THE Admin_Dashboard SHALL call `PUT /api/settings/social` with the updated URLs on the Backend_API.
4. WHEN the Admin saves content settings, THE Admin_Dashboard SHALL call `PUT /api/settings/content` with the updated text values on the Backend_API.
5. IF a settings save request fails, THEN THE Admin_Dashboard SHALL display the Backend_API error and preserve the unsaved form values so the Admin can retry.

---

### Requirement 16: Admin Profile

**User Story:** As the Admin, I want to view and update my profile so that my identity information remains accurate.

#### Acceptance Criteria

1. WHEN the Admin opens the Profile section, THE Admin_Dashboard SHALL fetch the Admin's profile from `GET /api/auth/me` on the Backend_API and display: name, email, profile image, and phone.
2. WHEN the Admin submits the profile edit form, THE Admin_Dashboard SHALL call `PUT /api/auth/me` with the updated fields on the Backend_API, including a new profile image file if provided.
3. THE Admin_Dashboard SHALL display the Admin's profile image in the header navigation; IF no profile image is set, THEN THE Admin_Dashboard SHALL display a default avatar using the Admin's initials.

---

### Requirement 17: Dark Mode and Light Mode

**User Story:** As the Admin, I want to switch between dark and light themes so that I can work comfortably in different lighting conditions.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a theme toggle button in the header.
2. WHEN the Admin clicks the theme toggle, THE Admin_Dashboard SHALL switch the active CSS theme between dark and light mode.
3. THE Admin_Dashboard SHALL persist the Admin's theme preference in `localStorage` under the key `adminTheme`.
4. WHEN the Admin_Dashboard loads, THE Admin_Dashboard SHALL apply the theme stored in `localStorage` before rendering the first visible frame, preventing a flash of the wrong theme.
5. WHERE no stored theme preference exists, THE Admin_Dashboard SHALL default to the operating system preference detected via the `prefers-color-scheme` CSS media query.

---

### Requirement 18: Responsive and Accessible UI

**User Story:** As the Admin, I want the dashboard to work well on both desktop and mobile screens so that I can manage the store from any device.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL render correctly and be fully usable on viewport widths of 320 px and above.
2. WHEN the viewport width is below 768 px, THE Admin_Dashboard SHALL collapse the sidebar navigation into a hamburger menu.
3. THE Admin_Dashboard SHALL meet WCAG 2.1 Level AA colour contrast requirements for all text and interactive elements.
4. THE Admin_Dashboard SHALL provide visible keyboard focus indicators on all interactive elements.
5. THE Admin_Dashboard SHALL use semantic HTML elements (`<nav>`, `<main>`, `<header>`, `<table>`, `<button>`) and ARIA roles where native semantics are insufficient.

---

### Requirement 19: Security

**User Story:** As the platform owner, I want the admin dashboard to enforce strict security controls so that no unauthorised party can access or modify store data.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL communicate with the Backend_API exclusively over HTTPS; IF a constructed request URL does not begin with `https://`, THE Admin_Dashboard SHALL abort the request and log an error to the console without sending it.
2. THE Admin_Dashboard SHALL never store the Firebase ID token in `localStorage`; WHEN the ID token is needed, THE Admin_Dashboard SHALL retrieve it from the Firebase SDK's in-memory state via `currentUser.getIdToken()`.
3. THE Backend_API SHALL enforce `adminOnly` middleware on all admin-specific endpoints; IF a request arrives with a JWT_Token that is absent, expired, or whose decoded payload does not contain a verified `isAdmin: true` claim, THEN THE Backend_API SHALL return HTTP 403 with a JSON body `{ "error": "Forbidden: admin access required" }` and reject the request without processing it.
4. THE Admin_Dashboard SHALL prevent XSS by ensuring that all dynamic content inserted into the DOM — including `innerHTML`, attribute values, and URL `href`/`src` bindings — is either rendered via React's JSX (which escapes by default) or explicitly sanitised to remove or encode any content that could cause script execution (e.g., `<script>` tags, `javascript:` URL schemes, and event handler attributes).
5. THE Admin_Dashboard SHALL store all API keys and environment-specific values in `.env` files (e.g., `.env.local`, `.env.production`) that are listed in `.gitignore` and excluded from version control.
6. THE Admin_Dashboard SHALL be deployed as a separate Vercel project with its own environment variables isolated from the Customer_Site deployment; the Customer_Site Vercel project SHALL NOT have access to the Admin_Dashboard's environment variables.

---

### Requirement 20: Standalone Deployment

**User Story:** As the platform owner, I want the admin dashboard deployed independently so that changes to the admin app do not risk the customer-facing site.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL be a separate React application located at `cloth_admin/` within the monorepo, with its own `package.json`, build pipeline, and `vercel.json` configuration file that includes a catch-all rewrite rule (`{ "source": "/(.*)", "destination": "/index.html" }`) to support client-side routing on Vercel.
2. THE Admin_Dashboard SHALL NOT import or reference any source files whose paths resolve inside `cloth_frontend/src/` or `cloth_backend/`; a tester SHALL be able to verify this by running `grep -r "cloth_frontend\|cloth_backend" cloth_admin/src` and receiving zero matches.
3. WHEN the Admin_Dashboard is built for production using `npm run build` (or `vite build` if Vite is used), THE Admin_Dashboard SHALL produce a static asset bundle in the `build/` (or `dist/`) directory deployable to Vercel without any server-side rendering step; IF the build exits with a non-zero code, THE Admin_Dashboard SHALL be considered failing this criterion.
4. THE Admin_Dashboard SHALL read the Backend_API base URL exclusively from the environment variable `VITE_API_URL` (if Vite) or `REACT_APP_API_URL` (if CRA) — the project MUST use one build tool consistently and document which variable applies in `.env.example`; no Backend_API URL SHALL be hardcoded in source files.
5. WHEN all environment variables listed in `cloth_admin/.env.example` are present, THE Admin_Dashboard build SHALL complete without errors or warnings related to missing environment variables; IF any listed variable is absent during build, THE Admin_Dashboard SHALL emit a descriptive error identifying the missing variable name.
