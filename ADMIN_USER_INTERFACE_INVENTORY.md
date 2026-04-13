# Yeshi Admin and User Interface Inventory

This file is a page-by-page inventory of the current Admin and User interface in the frontend. It is based on the actual HTML and JavaScript in this workspace, including buttons rendered dynamically from scripts.

---

## Shared User Navigation

The shared user navigation is injected by `frontend/js/main.js` and appears across user pages.

### Desktop Top Navigation
Main controls:
- `Home`: opens `/user/`
- `My Orders`: opens `/my-orders`
- `Order`: opens `/user/order`
- `Favorites`: opens `/user/favorites`
- `Notifications`: opens the notification drawer
- `Shopping bag`: opens `/cart`
- `Messages`: opens `/user/mychat`
- `Profile`: opens `/profile`
- `Logout`: clears the session for logged-in users

### Mobile Navigation
Main controls:
- `Menu`: opens the compact mobile menu
- `Home`: opens the storefront
- `My Orders`: opens user order history
- `Logout`: logs the user out when visible

### Mobile Bottom Navigation
Main controls:
- `Home`
- `Bag`
- `Favorite`
- `Messages`
- `Profile`

### Shared User Utility Controls
Main controls:
- Notification close button: closes the notification drawer
- Footer shortcut icon: opens footer access on mobile when enabled by shared layout script
- Bag badge: shows current bag item count
- Notification badge/dot: shows unread notifications

---

## Admin Pages

### `/admin/login.html`
Purpose:
- Admin signs in to the dashboard.

Main controls:
- `Login`: authenticates admin access

### `/admin/forgot-password.html`
Purpose:
- Admin starts password recovery.

Main controls:
- `Send OTP`: sends recovery OTP to the admin account

### `/admin/verify-otp.html`
Purpose:
- Admin verifies the recovery code.

Main controls:
- `Verify`: validates the OTP and continues recovery

### `/admin/reset-password.html`
Purpose:
- Admin sets a new password.

Main controls:
- `Show`: toggles password visibility for new password
- `Show`: toggles password visibility for confirm password
- `Reset Password`: saves the new password

### `/admin/dashboard.html`
Purpose:
- Admin sees overview data and can manage users, posts, orders, comments, settings, and password changes from one area.

Main controls:
- `Change Password`: opens the password update modal
- `Logout`: clears the admin session
- `Update`: saves a changed password inside the password modal
- `Cancel`: closes the password modal
- `Publish Post`: creates a new post
- `Save Links`: saves editable public links
- `Save`: stores post edits in the edit modal
- `Cancel`: closes the edit-post modal
- `Close`: closes the comments moderation modal
- `Update`: updates a selected user status
- `Edit`: opens a post for editing
- `Delete`: deletes a post
- `Comments`: opens comment moderation for a post
- `Attach reply image`: attaches an image to an admin reply on a comment
- `Send reply`: sends a reply to a comment
- `Save`: saves an edited comment
- `Delete`: deletes a comment
- Order status selector: changes order progress
- Payment status selector: changes payment verification state
- Payment `Update`: saves the selected payment status

### `/admin/users.html`
Purpose:
- Admin manages user accounts and device access.

Main controls:
- `Change Password`: opens password update modal
- `Logout`: logs out the admin
- `Update`: saves changed admin password
- `Cancel`: closes password modal
- `Refresh`: reloads devices for the selected user in the modal
- `Close`: closes the user devices modal
- `Refresh devices`: reloads the full device list
- `Update`: saves a user status change
- `Devices`: opens device details for a user
- `Block`: blocks a device hash
- `Unblock`: removes a device block

### `/admin/orders.html`
Purpose:
- Admin reviews each order and manages production, payment, pricing, and negotiation messages.

Main controls:
- `Change Password`: opens password update modal
- `Logout`: logs out the admin
- `Update`: saves changed admin password
- `Cancel`: closes password modal
- Sewing status selector: changes sewing progress
- `Update Sewing`: saves sewing status
- Payment status selector: changes payment verification state
- `Update Payment`: saves payment status
- Cloth price input: sets cloth cost in ETB
- Shipping price input: sets shipping cost in ETB
- `Set Price`: saves price values for the order
- `Attach image`: attaches an image to a negotiation message
- `Send message`: sends a negotiation message to the user
- `Remove`: clears the selected negotiation image before sending

### `/admin/order-stats.html`
Purpose:
- Admin reviews analytics and order statistics.

Main controls:
- `Change Password`: opens password update modal
- `Logout`: logs out the admin
- `Apply`: applies date or filter selection to analytics
- `Prev`: moves to previous user table page
- `Next`: moves to next user table page
- `Cancel`: closes the change-password modal
- `Update`: saves changed admin password

### `/admin/posts.html`
Purpose:
- Admin manages product posts and comment moderation.

Main controls:
- `Change Password`: opens password update modal
- `Logout`: logs out the admin
- `Update`: saves changed admin password
- `Cancel`: closes password modal
- `Add more image address`: adds another image URL field to the create form
- `Publish Post`: creates a new post
- `Show order count for all products`: enables ordered count visibility across posts
- `Hide order count for all products`: hides ordered count visibility across posts
- `Add more image address`: adds another image URL field to the edit form
- `Save`: saves post edits
- `Cancel`: closes the edit-post modal
- `Close`: closes the comment moderation modal
- `Edit`: opens a post in the edit modal
- `Delete`: deletes a post
- `Comments`: opens the comment moderation modal
- `Show Ordered Count` or `Hide Ordered Count`: toggles order count visibility on a post
- `Attach reply image`: attaches an image to an admin reply
- `Send reply`: sends a reply to a comment
- `Save`: saves an edited comment
- `Delete`: deletes a comment

### `/admin/links.html`
Purpose:
- Admin updates public links, delivery settings, website content, assets, blocked devices, and backups.

Main controls:
- `Change Password`: opens password update modal or flow entry
- `Logout`: logs out the admin
- `Save Links`: saves social and contact links
- `Save Delivery Settings`: saves delivery configuration
- `Upload Header Logo`: uploads the header logo asset
- `Upload Favicon`: uploads the site favicon
- `Save Website Text`: saves editable website text/content
- `Block Device`: blocks a device hash manually
- `Unblock Device`: unblocks a device hash manually
- `Refresh List`: reloads blocked device list
- `Download Database Backup (ZIP)`: downloads a backup package
- `Import Backup`: imports a backup file
- `Save Auto Backup`: saves automatic backup settings
- `Refresh History`: reloads backup history
- `Unblock`: removes a block from a listed blocked device

### `/admin/chat.html`
Purpose:
- Admin manages direct chat with users.

Main controls:
- `Change Password`: opens password change flow entry
- `Logout`: logs out the admin
- Conversation item button: opens a user conversation
- `Cancel`: clears the current reply target
- `Remove`: clears the selected attachment before sending
- `Attach file`: selects a file, image, or video for the outgoing message
- `Send`: sends the admin chat message
- `Reply`: opens reply mode for a specific message

---

## User Pages

### `/user/index.html`
Purpose:
- User browses the storefront and interacts with products.

Main controls:
- Category filter pills: `All`, `Women`, `Men`, `Couple`, `Wedding`, `Accessories`, `Kids`
- `Next Page`: loads more products when available
- `Close`: closes the video modal
- Video choice buttons: choose which video to play for a post
- `Back to choices`: returns from selected video playback to the choice list
- `Add to Bag`: saves a post to the shopping bag
- `Chat`: opens chat with the selected product context
- `Video`: opens product videos when available
- `Like`: likes or unlikes a post
- `Comment`: opens the post details page for comments
- `Share`: shares the post
- `Download`: downloads the image when enabled

### `/user/post.html`
Purpose:
- User views one product/post in detail, browses media, and interacts with comments.

Main controls:
- Comment attachment button: attaches an image to a comment
- Comment send button: submits a comment
- Video choice buttons: choose a post video
- `Download Image`: downloads the active product image
- Previous image button: moves to the previous image
- Next image button: moves to the next image
- Thumbnail buttons: jump directly to a selected image
- `Add to Bag`: adds the product to the bag
- `Share`: shares the post
- Post `Like`: likes or unlikes the post
- Post `Share`: shares from the action row
- Post `Bag`: quick add-to-bag action from the action row
- `Back to choices`: returns from selected video playback to the video choice list
- Comment `Like`: likes a comment
- `Reply`: opens the reply form for a comment
- Reply attachment button: attaches an image to a reply
- Reply send button: submits the reply

### `/user/cart.html`
Purpose:
- User reviews saved bag items and starts ordering from them.

Main controls:
- Notification close button: closes the notification drawer
- `Clear Bag`: removes all bag items
- `Buy from Bag`: opens the order flow for a saved item
- `Remove`: removes one saved item from the bag

### `/user/order.html`
Purpose:
- User completes the order wizard and submits a tailoring or product order.

Main controls:
- `-`: decreases quantity
- `+`: increases quantity
- `Back`: moves to the previous step of the order flow
- `Next`: moves to the next step of the order flow
- Final primary button: submits the order on the last step
- `Back to Order Page`: closes the refund policy section and returns to the order form

### `/user/my-orders.html`
Purpose:
- User tracks submitted orders, sends negotiation messages, and uploads payment proof when required.

Main controls rendered by `js/my-orders.js`:
- Order cards: show order status, payment status, sewing status, product details, and submitted measurements
- Negotiation `Attach image`: selects an image for a negotiation message
- Negotiation `Send message`: sends a message to admin about the order
- Negotiation `Remove`: clears the selected negotiation image
- Payment method selector: chooses `bank_transfer` or `telebirr` when payment proof is requested
- Payment proof file input: selects screenshot or proof file
- `Submit Payment Proof`: uploads payment proof for the order

### `/user/favorites.html`
Purpose:
- User sees liked products in one place.

Main controls:
- `Back`: returns to the home storefront
- Notification close button: closes the notification drawer
- `Chat`: opens product-aware chat for the liked item
- `View`: opens the liked product details page
- `Login`: appears when the user is not authenticated and opens the login page

### `/user/profile.html`
Purpose:
- User manages profile, shipping addresses, measurements, and refund-policy view.

Main controls:
- `Upload Profile`: uploads the profile image/avatar
- `Open Settings`: opens the settings panel
- Settings tabs: `Personal Details`, `Shipping Address`, `Measurements`, `Refund Policy`
- `Save Personal Details`: stores personal profile fields
- `Save Address`: stores a shipping address
- `Clear`: clears the shipping address form
- `Save Measurements`: stores saved measurements
- `Clear`: clears the measurement form
- `Back to Order Page`: returns to the order page from the refund-policy view
- Shipping `Edit`: loads a saved shipping address into the form
- Shipping `Delete`: removes a saved shipping address
- Measurement `Edit`: loads saved measurements into the form
- Measurement `Delete`: removes saved measurements

### `/user/mychat.html`
Purpose:
- User chats directly with admin.

Main controls:
- `Back`: returns to the previous page or home
- `Cancel`: clears the current reply target
- `Remove`: clears the selected attachment before sending
- `Attach`: selects a file/image for the outgoing message
- `Send`: sends the chat message
- `Go to new chat`: jumps to the latest unread or latest message area
- `Reply`: opens reply mode for a specific message
- `Reload`: reloads messages when the empty-state reload control appears

### `/user/login.html`
Purpose:
- User signs in.

Main controls:
- `Show`: toggles password visibility
- `Login`: authenticates the user

### `/user/signup.html`
Purpose:
- User creates a new account.

Main controls:
- `Show`: toggles password visibility
- `Show`: toggles confirmation password visibility
- `Create account`: submits registration

### `/user/forgot-password.html`
Purpose:
- User starts password recovery.

Main controls:
- `Send reset link`: sends password reset email or reset flow trigger

### `/user/reset-password.html`
Purpose:
- User sets a new password.

Main controls:
- `Reset password`: saves the new password

### Informational User Pages
Pages:
- `/user/about.html`
- `/user/contact.html`
- `/user/how-it-works.html`
- `/user/size-guide.html`
- `/user/developer-information.html`

Purpose:
- User reads informational content, contact details, process guidance, and brand/developer information.

Main controls:
- Shared navigation controls from `js/main.js`
- Notification drawer open and close controls where notification UI is present

---

## Admin and User Functional Summary

### Admin only
- Log in to the protected admin area
- Manage users and user devices
- Manage posts, comments, and ordered-count visibility
- Review orders, set prices, update sewing/payment status, and send negotiation messages
- Edit public links, content, logos, favicon, delivery settings, device blocks, and backups
- View statistics and handle support chat

### User only
- Register, log in, and reset password
- Browse posts, like, comment, reply, share, download media, and open product chat
- Add items to bag, review favorites, place orders, and track orders
- Upload payment proof and negotiate order details with admin
- Manage profile, addresses, and measurements
- Chat with admin and receive notifications