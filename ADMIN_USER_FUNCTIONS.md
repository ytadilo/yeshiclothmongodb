# Yeshi Admin and User Functions

This document lists only the Admin and User roles. It removes employee, driver, and job-application concepts and focuses on what Admin and User can do in the frontend interface and in the backend API.

Detailed page-by-page UI and button behavior is documented in `ADMIN_USER_INTERFACE_INVENTORY.md`.

---

## Frontend

## Admin Interface

### Admin Login Pages
Pages:
- `/admin/login.html`
- `/admin/forgot-password.html`
- `/admin/verify-otp.html`
- `/admin/reset-password.html`

What Admin does:
- Log in to the admin system
- Request password reset
- Verify OTP code
- Set a new password

Main button functionality:
- `Login`: authenticates admin and opens the dashboard
- `Forgot Password`: sends admin to password recovery flow
- `Verify OTP`: confirms the recovery code
- `Reset Password`: saves the new password

### Admin Dashboard
Page:
- `/admin/dashboard.html`

What Admin does:
- View top-level business summary
- Check recent activity
- Open management pages quickly

Main button functionality:
- Dashboard shortcut cards: open orders, users, posts, links, stats, and chat sections
- Notification controls: open notification panel and review alerts
- Logout: clears session and returns to admin login

### Admin Users Management
Page:
- `/admin/users.html`

What Admin does:
- View all registered users
- Search and inspect user accounts
- Change user status
- Review account/device information

Main button functionality:
- `Search`: filters user list
- `View`: opens user details
- `Activate`: changes status to active
- `Deactivate`: changes status to inactive
- `Ban`: blocks account access
- `Unban` or `Restore`: re-enables account access
- Device actions: inspect or block/unblock suspicious devices

### Admin Orders Management
Pages:
- `/admin/orders.html`
- `/admin/order-stats.html`

What Admin does:
- View all customer orders
- Review payment screenshots and order details
- Update order progress
- Track platform order statistics

Main button functionality:
- `View Order`: opens full order details
- `Update Status`: changes order progress
- `Update Payment Status`: marks payment as pending, verified, or rejected
- `Filter`: narrows orders by status/date/customer
- `Refresh`: reloads latest order data
- Stats controls: switch between totals, trends, and summaries

### Admin Posts Management
Page:
- `/admin/posts.html`

What Admin does:
- Create new posts for the catalog
- Edit existing post content
- Remove posts
- Manage pricing, images, and descriptions

Main button functionality:
- `Add Post`: opens create form
- `Save`: creates a new post or updates an existing post
- `Edit`: loads selected post into form
- `Delete`: removes selected post
- Image upload button: attaches post images
- `Publish` or visible save action: makes post available to users

### Admin Links and Settings Management
Page:
- `/admin/links.html`

What Admin does:
- Update public site links
- Edit social media links and contact content
- Control editable site information shown on frontend pages

Main button functionality:
- `Save Links`: stores updated social/contact links
- `Update Settings`: saves editable public content
- `Preview` if present: checks current values before publishing

### Admin Chat Interface
Page:
- `/admin/chat.html`

What Admin does:
- Read user messages
- Reply to customer questions
- Track communication tied to orders or support requests

Main button functionality:
- `Send`: posts a message to the active conversation
- Conversation selector: opens a specific chat thread
- Attachment or upload button if shown: sends a related file/image
- Notification or unread controls: highlight new user messages

---

## User Interface

### Public and User Entry Pages
Pages:
- `/user/index.html`
- `/user/login.html`
- `/user/signup.html`
- `/user/forgot-password.html`
- `/user/reset-password.html`

What User does:
- Visit the public storefront
- Register an account
- Log in to an existing account
- Recover account access

Main button functionality:
- `Sign Up`: creates a new user account
- `Login`: authenticates the user
- `Forgot Password`: starts reset flow
- `Reset Password`: saves the new password
- Navigation buttons: open catalog, contact, size guide, and support pages

### User Browsing and Post Viewing
Pages:
- `/user/index.html`
- `/user/post.html`
- `/user/about.html`
- `/user/how-it-works.html`
- `/user/size-guide.html`
- `/user/contact.html`
- `/user/developer-information.html`

What User does:
- Browse clothing posts
- Open post details
- Read brand and support information
- Check ordering guidance and measurements

Main button functionality:
- Post card click: opens selected post details
- `Like`: saves a like on a post when enabled
- `Comment`: adds a user comment
- `Reply`: responds to a comment thread
- `Share`: records or triggers post sharing
- `Order` or `Buy`: moves user toward the order page
- `Add to Bag`: stores the item in the shopping bag
- `Favorite`: saves the item for later

### User Shopping Bag
Page:
- `/user/cart.html`

What User does:
- Review saved items before ordering
- Remove unwanted items
- Start order flow from saved items

Main button functionality:
- `Buy from Bag`: opens order page for the selected saved item
- `Remove`: deletes one item from the bag
- `Clear Bag`: deletes all saved items

### User Order Interface
Pages:
- `/user/order.html`
- `/user/my-orders.html`

What User does:
- Submit a tailoring order
- Enter measurements and delivery details
- Upload payment screenshot and reference images
- Track submitted orders

Main button functionality:
- `Submit Order`: creates a new order
- File upload buttons: attach payment screenshot or reference images
- Delivery method selectors: choose delivery option
- Size or measurement inputs: provide tailoring details
- `View My Orders`: opens user order history
- Order item action buttons: view order details and latest status

### User Profile and Saved Content
Pages:
- `/user/profile.html`
- `/user/favorites.html`

What User does:
- Review personal profile information
- Update own profile data if enabled in the UI
- See saved favorite items

Main button functionality:
- `Update Profile`: saves profile changes
- `Remove Favorite`: deletes an item from favorites
- Item open button/card click: opens saved item details

### User Chat and Notifications
Page:
- `/user/mychat.html`

What User does:
- Message admin for support or order questions
- Read incoming notifications and updates

Main button functionality:
- `Send`: sends a chat message to admin
- Conversation selector if present: opens a support thread
- Notification trigger: opens notification drawer
- `Mark Read` if present: clears unread notification state

---

## Backend

## Admin API Functions

Admin can do these backend actions:
- Authenticate as admin
- Read all users and moderate their status
- Block or unblock user access and device access
- Read all orders and update order status
- Update payment verification state
- Create, edit, and delete posts
- Read notifications and audit-related activity
- Manage site settings and public links
- Access uploads needed for moderation or post management
- Access exchange-rate and system support endpoints used by admin screens

Main backend modules used by Admin:
- `/api/auth`
- `/api/admin/users`
- `/api/admin/devices`
- `/api/orders`
- `/api/posts`
- `/api/settings`
- `/api/workflow` for admin chat, notifications, and audit-related actions
- `/api/uploads`
- `/api/exchange`

## User API Functions

User can do these backend actions:
- Register and log in
- Request password reset and complete reset flow
- Read public posts and post details
- Like, comment, reply, and share posts when authenticated
- Create orders
- Read own orders
- Upload payment screenshots and reference images during ordering
- Read notifications
- Send chat messages to admin
- Read and update own profile data where supported

Main backend modules used by User:
- `/api/auth`
- `/api/posts`
- `/api/orders`
- `/api/workflow` for chat and notifications
- `/api/settings`
- `/api/uploads`

---

## Role Summary

## Admin Only
- Controls platform data, users, orders, posts, settings, moderation, and support operations
- Has access to management dashboards and system-wide actions

## User Only
- Browses posts, saves favorites/bag items, places orders, tracks personal orders, and contacts admin
- Has access only to personal account, personal order data, and public storefront features