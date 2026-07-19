Warehouse and Multi-Shop Management System

Complete Business Context, Functional Scope, and Development Specification

⸻

1. Purpose of This Document

This document explains the complete system that must be built for the client.

It is intended to serve as the main project context for the developer and the developer’s AI. It explains:

* How the client’s business currently operates.
* The problem the system must solve.
* Every agreed feature.
* The correct workflow for stock, sales, debts, payments, and expenses.
* The technical and database rules that must protect the data.
* What must not be added.
* The tests and acceptance criteria required before completion.

The developer must read and understand the full document before writing code.

The system must be complete and reliable, but it must remain simple. It is not intended to become a large ERP, accounting suite, or enterprise platform.

⸻

2. Business Background

The client operates a trading business that imports different types of products from outside the country.

The business currently has:

* One central warehouse.
* Two physical shops.
* The possibility of opening more shops later.

The products include:

* Mobile phones.
* AirPods.
* Earphones.
* Phone accessories.
* Clothing.
* Other general products.

Products are normally ordered from suppliers abroad, including suppliers in China.

The general business process is:

1. The business orders products from a supplier.
2. The products remain in transit for a period.
3. The products arrive at the central warehouse.
4. The products are distributed from the warehouse to one or more shops.
5. Each shop sells its own stock.
6. Each shop records its own expenses.
7. Some customers pay fully.
8. Some customers pay only part of the sale.
9. Some customers take products completely on debt.
10. Customers may return later and pay their remaining debt in one or several payments.

The owner currently needs a clear way to follow all these movements.

The system must answer questions such as:

* What products have we ordered?
* Which products have not arrived yet?
* What is currently inside the warehouse?
* What was transferred from the warehouse?
* Which shop received each product?
* What is currently available inside each shop?
* What has each shop sold?
* At what price was each item sold?
* How much money was actually collected?
* How much remains unpaid?
* Which customers owe money?
* How much has each customer already paid?
* What expenses has each shop recorded?
* What happened to a specific product from the moment it was ordered until it was sold?

⸻

3. Core Product Philosophy

The application must follow these principles.

3.1 Simplicity

The client and employees are not technical users.

The interface must be:

* Clear.
* Fast.
* Easy to learn.
* Mobile-first.
* Free from unnecessary fields and settings.
* Designed around real daily actions.

Users should not need accounting knowledge to operate the application.

3.2 Reliability

Although the interface must be simple, the internal system must be robust.

It must prevent:

* Negative stock.
* Products disappearing without a recorded movement.
* Sales being deleted silently.
* Customer debts becoming inaccurate.
* Payments being recorded without a customer.
* Transfers updating only one location.
* Old prices changing when a product is edited.
* Cancelled transactions remaining inside active totals.

3.3 Controlled Scope

Do not turn the project into:

* A full ERP.
* A complete accounting platform.
* An employee-management system.
* A supplier-payment system.
* A delivery platform.
* An e-commerce application.
* A complicated CRM.

Only build what is explicitly described in this document.

⸻

4. Application Format

The system will be built as a responsive web application.

It must work correctly on:

* Android phones.
* iPhones.
* Tablets.
* Laptop computers.
* Desktop computers.

It must also be configured as a Progressive Web Application, or PWA.

This allows users to install the system on the home screen of Android and iPhone devices and open it similarly to a normal mobile application.

The PWA must include:

* Application name.
* Application icon.
* Standalone display mode.
* Responsive mobile layout.
* Web application manifest.
* Service worker.
* Basic caching of the application interface and static files.

The application will use the same server and database whether opened from a browser or installed on a phone.

Version 1 does not require complex offline operation or offline stock synchronization.

⸻

5. Main Business Workflow

The system must reflect the following product journey.

Stage 1: Product Creation

A product is created inside the system.

It may be:

* A product already owned by the business.
* A new product being ordered for the first time.
* A product with a fixed suggested price.
* A product with no price yet.

Stage 2: Incoming Order

The business records that it ordered a quantity from a supplier.

For example:

* Product: AirPods Pro.
* Quantity ordered: 50.
* Status: Shipped.

The 50 units must not appear as warehouse stock because they have not arrived.

Stage 3: Receiving the Product

When the order arrives, the warehouse employee records the quantity actually received.

For example:

* Ordered: 50.
* Received: 45.
* Remaining: 5.

The system adds only 45 to warehouse stock.

Stage 4: Warehouse Storage

The products remain inside the warehouse until they are transferred to a shop.

Stage 5: Shop Transfer

The warehouse employee selects:

* Product.
* Quantity.
* Destination shop.

The system automatically:

* Removes the quantity from the warehouse.
* Adds it to the selected shop.
* Records the complete transfer.

Stage 6: Sale

The shop employee sells one or more products.

The system:

* Records the actual selling price.
* Removes the sold quantity from shop stock.
* Records the total sale.
* Records how much the customer paid.
* Records any remaining debt.
* Generates a printable receipt.

Stage 7: Customer Debt Payment

If the customer still owes money, the customer may return later and pay part or all of the remaining debt.

The system:

* Records the payment.
* Reduces the customer’s debt.
* Updates the related unpaid sales.
* Records which shop received the payment.
* Generates a simple payment receipt.

Stage 8: Shop Expenses

Each shop records its expenses independently.

Stage 9: Reporting

The owner sees:

* Stock.
* Transfers.
* Sales.
* Cash collected.
* Customer debts.
* Debt payments.
* Expenses.
* Business activity by shop.

⸻

6. Users and Roles

Keep the role system simple.

6.1 Owner or Administrator

The owner has access to the complete system.

The owner can:

* View all shops and the warehouse.
* Create products and categories.
* Create incoming orders.
* Receive incoming products.
* Register direct stock receipts.
* Create and manage shops.
* Create and manage users.
* Transfer products.
* View and record sales.
* View and record expenses.
* View customers and debts.
* Register customer payments.
* Cancel authorized transactions.
* Perform stock corrections.
* View all reports.
* Archive products and shops.
* Manage application settings.

6.2 Warehouse Employee

The warehouse employee can be allowed to:

* View warehouse stock.
* Create incoming orders.
* Receive products.
* Add direct stock receipts.
* Transfer products to shops.
* Record shop-to-warehouse returns.
* View warehouse movement history.
* Perform authorized corrections.

The warehouse employee should not automatically have access to all financial reports.

6.3 Shop Employee

A shop employee is assigned to one shop.

The employee can:

* View that shop’s stock.
* Record sales for that shop.
* Select or create customers during sales.
* Record full or partial customer payments.
* Print sale receipts.
* Record customer debt payments.
* Print payment receipts.
* Record expenses for that shop.
* View recent activities for that shop.

The shop employee must not automatically access:

* Another shop’s stock.
* Another shop’s sales.
* Another shop’s debts.
* Another shop’s expenses.
* User management.
* Global owner reports.
* Sensitive correction functions.

6.4 Permissions

Do not build a complicated permission-builder interface.

Use clear predefined roles.

All permissions must be enforced on the server, not only hidden in the interface.

Changing a URL or API request must not allow an employee to access another shop.

⸻

7. Authentication

Recommended login:

* Phone number or username.
* Numeric PIN or password.

Email must not be mandatory.

Requirements:

* Secure password hashing.
* Protected sessions or secure tokens.
* Logout.
* Active or disabled user status.
* Rate limiting for repeated failed login attempts where practical.
* Server-side role validation.

The administrator can:

* Create users.
* Assign a role.
* Assign a shop where required.
* Reset a password or PIN.
* Disable a user.

⸻

8. Main Application Sections

The owner’s main navigation should include:

1. Dashboard.
2. Products.
3. Incoming Orders.
4. Warehouse.
5. Transfers.
6. Shops.
7. Sales.
8. Customers and Debts.
9. Payments.
10. Expenses.
11. Reports.
12. Users and Settings.

For employees, show only relevant sections.

On mobile, use a clean bottom navigation or compact menu.

Do not show every possible section at the same time if it overwhelms the user.

⸻

9. Dashboard

The owner dashboard should provide a quick business summary.

Recommended information:

* Number of active products.
* Current warehouse stock.
* Incoming orders not fully received.
* Recent products received.
* Recent transfers.
* Today’s sales value.
* Money collected today.
* New debt created today.
* Customer debt payments collected today.
* Current total customer debt.
* Today’s expenses.
* Low-stock products.
* Summary of each shop.

Important distinction:

The dashboard must not treat sales value and cash collected as the same thing.

Example:

* Sales today: 100,000 MRU.
* Money collected today: 60,000 MRU.
* New debt created: 40,000 MRU.

The shop employee dashboard should show only that shop’s information.

Avoid unnecessary complicated charts.

⸻

10. Product Management

10.1 Product Fields

A product may include:

* Product name.
* Product category.
* Product code or SKU, optional.
* Barcode, optional.
* Product image, optional.
* Description or notes, optional.
* Suggested purchase cost, optional.
* Suggested sale price, optional.
* Low-stock threshold, optional.
* Active or archived status.

Only the product name and category should normally be required.

10.2 Product Categories

The administrator can create categories such as:

* Phones.
* Phone accessories.
* Earphones.
* Clothing.
* Electronics.
* General products.

Categories can be added later without changing the code.

10.3 Flexible Pricing

Products do not require a fixed price.

The business often negotiates prices with customers.

The system must support:

* Product with no sale price.
* Product with a suggested sale price.
* Product sold at a different price in every transaction.
* Product with no recorded purchase cost.
* Product with a suggested purchase cost.

If a suggested sale price exists, it may be pre-filled during a sale.

The seller must still be able to change it.

If no suggested price exists, the seller enters the actual agreed price during the sale.

The application must not block product creation because pricing information is missing.

10.4 Editing Products

The user can edit:

* Name.
* Category.
* Image.
* Notes.
* Suggested prices.
* Low-stock threshold.

Historical transactions must retain their original values.

Changing the product name or default price must not rewrite old sales or receipts.

Therefore, sale items should save relevant snapshots, including:

* Product name at the time of sale.
* Actual unit sale price.
* Purchase cost at the time, if available.

10.5 Deleting and Archiving Products

A product can be permanently deleted only when it has no history.

If the product has any:

* Incoming order.
* Receipt.
* Transfer.
* Sale.
* Return.
* Stock correction.
* Opening stock.

it cannot be permanently deleted.

It must be archived.

Archived products:

* Disappear from normal active lists.
* Remain in previous reports.
* Keep all history.
* Can be restored by the administrator.

⸻

11. Incoming Orders

Incoming orders represent products ordered from suppliers but not yet fully received.

11.1 Creating an Order

An incoming order contains:

* Automatically generated reference number.
* Supplier name, optional.
* Order date.
* Expected arrival date, optional.
* Notes, optional.
* Order status.
* One or multiple products.

Each order item contains:

* Existing product or newly created product.
* Quantity ordered.
* Unit purchase cost, optional.
* Notes, optional.

11.2 New Product During Order

The user can create a new product directly while creating an order.

The product may initially have:

* Zero warehouse quantity.
* No suggested sale price.
* No purchase cost.
* An ordered quantity waiting to arrive.

11.3 Order Statuses

Use only these statuses:

* Ordered.
* Shipped.
* Partially Received.
* Received.
* Cancelled.

Do not create a complex shipping workflow.

11.4 Stock Rule

Ordered quantity must not appear as physical stock.

The system should clearly separate:

* Ordered quantity.
* Received quantity.
* Remaining quantity.

11.5 Receiving an Order

When an order arrives, the user opens it and chooses “Receive Products.”

For every product, the user enters the quantity actually received.

Example:

* Quantity ordered: 100.
* Quantity received today: 70.
* Quantity remaining: 30.

The system must:

* Add 70 to warehouse stock.
* Create a stock receipt.
* Create inventory movement records.
* Update the order item.
* Set the order status to Partially Received.

When all quantities have arrived, set the status to Received.

11.6 Prevent Over-Receiving

The system should normally prevent receiving more than the outstanding quantity.

If exceptional over-delivery must be supported, the user should use a direct stock receipt for the extra quantity rather than silently changing the order.

11.7 Cancelled Orders

A cancelled order:

* Adds no stock.
* Remains visible in history.
* Is excluded from active incoming-order lists.
* Records who cancelled it and why, where required.

⸻

12. Direct Warehouse Stock Receipt

Sometimes products may arrive without a previously registered order.

The system must allow a direct receipt.

The user selects:

* Product.
* Quantity received.
* Date.
* Supplier or source, optional.
* Unit purchase cost, optional.
* Notes, optional.

The system:

* Adds the quantity to the warehouse.
* Creates a stock receipt.
* Creates an inventory movement.
* Records the user and time.

Users must not directly overwrite the displayed warehouse quantity.

⸻

13. Initial Stock Setup

When the application is first introduced, the client may already have stock in:

* The warehouse.
* Shop 1.
* Shop 2.

The owner needs an initial stock-entry process.

For each location:

* Select product.
* Enter current opening quantity.
* Add an optional opening cost.
* Add optional notes.

The system creates an “Initial Stock” inventory movement.

Only authorized administrators should perform initial stock setup.

⸻

14. Warehouse Management

The warehouse page shows:

* Product name.
* Category.
* Current quantity.
* Low-stock status.
* Product image, if available.
* Suggested purchase or sale price, if useful.
* Shortcut to movement history.
* Shortcut to transfer.

Users can:

* Search products.
* Filter by category.
* View low-stock products.
* View out-of-stock products.
* Receive products.
* Transfer products.
* Perform authorized corrections.
* View complete movement history.

The system must never allow warehouse stock to become negative.

⸻

15. Shop Management

The client currently has two shops, but more shops may be created later.

15.1 Shop Fields

A shop may contain:

* Shop name.
* Address, optional.
* Phone number, optional.
* Active or archived status.

15.2 Independent Shop Data

Every shop has its own:

* Inventory.
* Sales.
* Customers and related debt transactions.
* Payments collected.
* Expenses.
* Reports.
* Assigned employees.

15.3 Creating Shops

The owner can add a shop without developer intervention.

15.4 Archiving Shops

A shop with history must not be deleted permanently.

It can be archived.

Before archiving, the system should warn the owner if the shop still contains stock.

Archived shops:

* Cannot create normal new transactions.
* Remain in old reports.
* Keep all sales, debts, expenses, and stock history.
* Can be restored when necessary.

⸻

16. Stock Transfers

The main transfer type is:

* Warehouse to shop.

The system should also support:

* Shop to warehouse.

A shop-to-shop transfer may be supported if it uses the same simple transfer process.

16.1 Transfer Fields

A transfer contains:

* Reference number.
* Source location.
* Destination location.
* Product or products.
* Quantity for each product.
* Transfer date.
* Notes, optional.
* User.
* Status.

16.2 Transfer Result

Example:

Warehouse has 20 phones.

The user transfers 5 phones to Shop 1.

After confirmation:

* Warehouse quantity becomes 15.
* Shop 1 quantity becomes 5.
* A transfer record is created.
* Inventory movements are created.

16.3 Validation

The system must prevent:

* Transfer above available stock.
* Zero quantity.
* Negative quantity.
* Same source and destination.
* Transfer to or from an archived location.
* Unauthorized location access.

16.4 Atomic Operation

The source reduction and destination increase must happen inside one database transaction.

Either both succeed or neither succeeds.

16.5 Transfer Cancellation or Reversal

Completed transfers must not be deleted silently.

If a transfer was entered incorrectly, an authorized administrator can reverse it.

The reversal must:

* Restore the source stock.
* Remove the destination stock.
* Confirm that the destination still has enough quantity.
* Record the reason.
* Preserve the original transfer.
* Mark it as reversed or cancelled.

⸻

17. Shop Inventory

Each shop inventory page shows:

* Product.
* Category.
* Available quantity.
* Suggested price, if available.
* Low-stock status.
* Out-of-stock status.

Shop employees can:

* Search products.
* Filter products.
* Begin a sale.
* View recent stock movements.
* See transferred quantities.

A shop’s stock changes only through:

* Initial stock.
* Transfers received.
* Sales.
* Sale returns.
* Stock corrections.
* Transfers back to warehouse.
* Shop-to-shop transfers, if enabled.

Users must not manually overwrite the final quantity.

⸻

18. Customers

Customer records are necessary because sales may be made on debt.

18.1 Customer Fields

A customer contains:

* Customer name.
* Phone number, optional.
* Notes, optional.
* Active status.
* Created date.

18.2 Creating Customers

Customers can be created:

* From the Customers section.
* Directly during a sale.

18.3 Customer Requirement

A customer is optional for a fully paid sale.

A customer is mandatory when:

* The customer pays only part of the sale.
* The customer pays nothing.
* Any amount remains unpaid.

The system must not create anonymous debt.

18.4 Duplicate Customers

The system should help users avoid duplicates by allowing search by:

* Name.
* Phone number.

It does not need a complicated duplicate-merging tool in Version 1.

18.5 Customer Page

Each customer page shows:

* Name.
* Phone number.
* Total sales value.
* Total amount paid.
* Total remaining debt.
* Unpaid sales.
* Partially paid sales.
* Payment history.
* Latest activity.
* Button to register payment.
* Button to print payment receipt.

⸻

19. Sales

The sale workflow must be fast and easy.

19.1 Sale Contents

A sale may include one or multiple products.

For each item:

* Product.
* Quantity.
* Actual unit sale price.
* Line total.

The overall sale contains:

* Shop.
* Customer, optional or required depending on debt.
* Sale date.
* Subtotal.
* Total amount.
* Amount paid now.
* Amount remaining.
* Payment status.
* Notes, optional.
* User.
* Reference number.

19.2 Actual Sale Price

The actual selling price must be stored on the sale item.

The suggested product price is only a default.

The employee can change the price during every sale.

19.3 Multiple Products

Example sale:

* 1 phone at 20,000 MRU.
* 2 earphones at 1,000 MRU each.
* 1 charger at 500 MRU.

Total:

22,500 MRU.

The receipt and sale record must show every line separately.

19.4 Stock Validation

Before confirmation, the system checks that every item is available in the selected shop.

The system must not permit sales above available stock.

19.5 Payment at Sale

The user enters the amount paid now.

The system automatically calculates:

Amount remaining = Total sale amount − Amount paid now

The amount paid must be:

* Zero or greater.
* No greater than the sale total.

19.6 Payment Status

The system automatically assigns:

Paid

Amount remaining is zero.

Partially Paid

The customer paid part of the sale and still owes money.

Unpaid

The customer paid nothing.

Cancelled

The sale was cancelled by an authorized user.

19.7 Fully Paid Sale

Example:

* Sale total: 10,000 MRU.
* Amount paid: 10,000 MRU.
* Amount remaining: 0.

A customer record is optional.

19.8 Partial Payment Sale

Example:

* Sale total: 10,000 MRU.
* Amount paid: 4,000 MRU.
* Amount remaining: 6,000 MRU.

A customer record is mandatory.

19.9 Full Debt Sale

Example:

* Sale total: 10,000 MRU.
* Amount paid: 0.
* Amount remaining: 10,000 MRU.

A customer record is mandatory.

19.10 Sale Confirmation

The sale confirmation operation must:

1. Validate the shop.
2. Validate the products.
3. Validate available stock.
4. Calculate the total.
5. Validate the amount paid.
6. Require a customer when debt exists.
7. Create the sale.
8. Create sale items.
9. Deduct stock.
10. Create inventory movements.
11. Create the initial customer payment if money was paid.
12. Allocate that payment to the sale.
13. Calculate the remaining balance.
14. Generate a receipt reference.
15. Commit everything in one database transaction.

If any step fails, the entire process must roll back.

⸻

20. Customer Debts

The system must maintain a clear debt record.

The total debt for a customer equals the total remaining balance across all active unpaid or partially paid sales.

The customer page should display:

* Total purchases.
* Total paid.
* Total outstanding.
* Number of unpaid sales.
* Each unpaid sale.
* Remaining balance for each sale.

Example:

Customer: Mohamed

* Total purchases: 30,000 MRU.
* Total paid: 18,000 MRU.
* Total outstanding: 12,000 MRU.

Unpaid sales:

* SAL-000015: 7,000 MRU remaining.
* SAL-000021: 5,000 MRU remaining.

Do not store debt only as one manually editable customer number.

Debt must be derived from valid sales and payment allocations.

⸻

21. Registering Later Customer Payments

When a customer returns to pay, the user opens the customer account and selects “Register Payment.”

21.1 Payment Fields

A customer payment contains:

* Payment reference number.
* Customer.
* Shop receiving the money.
* Amount.
* Payment date.
* Notes, optional.
* User.
* Status.

21.2 Validation

The system must:

* Confirm that the customer has debt.
* Require an amount greater than zero.
* Prevent payment above the total outstanding debt.
* Prevent negative customer balance.
* Restrict access by shop role where necessary.

Version 1 does not need customer credit balances.

21.3 Payment Allocation

The recommended default is:

Apply the payment to the oldest unpaid sale first.

Example:

* Oldest sale balance: 3,000 MRU.
* Second sale balance: 5,000 MRU.
* Customer pays: 4,000 MRU.

Result:

* Oldest sale becomes fully paid.
* 1,000 MRU is applied to the second sale.
* Second sale balance becomes 4,000 MRU.

An administrator may optionally select a specific sale, but the standard employee workflow should remain automatic and simple.

21.4 Payment Result

After payment:

* The payment is saved.
* Payment allocations are created.
* The related sales are updated.
* Payment statuses are recalculated.
* Customer debt is updated.
* Cash collected for the receiving shop increases.
* A payment receipt becomes available.

All steps must occur inside one database transaction.

⸻

22. Sales Value Versus Money Collected

This distinction is critical.

The system must separately report:

Sales Value

The total price of products sold.

Money Collected at Sale

The amount customers paid when the sale was created.

Later Debt Payments

Money collected later from old debt.

Outstanding Debt

Money still owed by customers.

Example:

The shop sells products worth 100,000 MRU.

Customers pay only 60,000 MRU.

The report must show:

* Sales value: 100,000 MRU.
* Money collected: 60,000 MRU.
* Outstanding debt: 40,000 MRU.

It must not claim that 100,000 MRU entered the shop’s cash.

If another customer later pays 10,000 MRU toward an old debt:

* Current-day sales do not increase by 10,000 MRU.
* Current-day cash collected increases by 10,000 MRU.
* Outstanding debt decreases by 10,000 MRU.

⸻

23. Receipts

The system must generate two types of simple receipt.

23.1 Sale Receipt

After confirming a sale, show a clear button:

* View Receipt.
* Print Receipt.

The sale receipt contains:

* Business name.
* Shop name.
* Sale reference number.
* Date and time.
* Customer name, if recorded.
* Customer phone, if recorded.
* Products sold.
* Quantity.
* Unit price.
* Line total.
* Total sale amount.
* Amount paid.
* Amount remaining.
* Payment status.
* Optional short footer.

23.2 Customer Payment Receipt

When a customer pays an existing debt, the payment receipt contains:

* Business name.
* Shop name.
* Payment reference.
* Customer name.
* Payment date.
* Amount paid.
* Debt before payment.
* Debt after payment.
* User who received it, if appropriate.
* Optional short footer.

23.3 Receipt Design

Receipts must be:

* White background.
* Black text.
* Simple.
* Easy to read.
* Suitable for normal browser printing.
* Suitable for narrow receipt printers where possible.
* Free from unnecessary colors or heavy graphics.

The business logo may be added if provided.

23.4 Reprinting

Users with access can:

* Reprint an old sale receipt.
* Reprint an old payment receipt.

Completed receipts must preserve the original transaction values.

⸻

24. Sale Cancellation and Returns

Completed sales must not be permanently deleted.

24.1 Sale Without Later Payments

An authorized administrator may cancel a sale.

The system must:

* Return the products to shop stock.
* Reverse inventory movements.
* Remove the sale from active sales totals.
* Remove the related unpaid debt.
* Reverse the amount collected when appropriate.
* Record the cancellation reason.
* Preserve the sale with Cancelled status.

24.2 Sale With Later Debt Payments

A sale that already has later customer payments is more sensitive.

Do not allow ordinary employees to cancel it.

The administrator must receive a warning.

The system must not cancel it unless the payment allocations are properly reversed or addressed.

The simplest safe Version 1 rule is:

* Only an administrator can cancel such a sale.
* All related active payment allocations must first be reversed.
* The system records a clear reason.
* The sale remains visible as cancelled.

24.3 Customer Return

A basic return can be handled as a controlled sale cancellation or partial return.

To keep Version 1 manageable:

* Full-sale cancellation must be supported.
* Partial-return support may be added only if implemented safely using item-level return records.

Do not implement a fragile partial-return workflow that corrupts stock or debt.

⸻

25. Payment Cancellation

Customer payments must not be permanently deleted.

An administrator can reverse a payment entered by mistake.

The reversal must:

* Mark the payment as cancelled or reversed.
* Reverse all payment allocations.
* Restore the relevant sale balances.
* Increase the customer’s outstanding debt.
* Remove the payment from cash-collected totals.
* Record who reversed it and why.

This must happen inside one database transaction.

⸻

26. Expenses

Each shop records its own expenses.

26.1 Expense Fields

An expense contains:

* Reference number.
* Shop.
* Amount.
* Expense category.
* Date.
* Description or reason.
* Notes, optional.
* User.
* Status.

26.2 Expense Categories

Default examples:

* Transport.
* Rent.
* Electricity.
* Worker payments.
* Repairs.
* Supplies.
* Other.

The administrator can add categories.

26.3 Expense Editing and Cancellation

Authorized users may correct or cancel an expense.

Cancelled expenses:

* Remain in history.
* Are excluded from active totals.
* Record who cancelled them and why.

Do not silently delete financial records.

⸻

27. Profit and Financial Labels

Because many products may not have a purchase cost, the system must avoid misleading labels.

Always support:

* Sales value.
* Money collected.
* Expenses.
* Outstanding customer debt.
* Difference between collected money and expenses.

Where product costs are available, the system may also calculate:

* Cost of goods sold.
* Estimated gross profit.
* Estimated operating result.

If costs are incomplete, clearly label these values as estimated.

Do not call sales minus expenses “net profit” when product costs are missing.

⸻

28. Stock Corrections

Stock corrections are necessary for:

* Damage.
* Loss.
* Counting mistakes.
* Broken products.
* Data-entry errors.
* Products found during recounting.

A stock correction contains:

* Location.
* Product.
* Quantity added or removed.
* Reason.
* Notes, optional.
* Date.
* User.
* Reference number.

Examples:

* Remove 2 damaged earphones.
* Add 1 phone found during recounting.

Only authorized users should perform corrections.

A correction must create an inventory movement.

The final stock quantity must never be directly overwritten.

⸻

29. Inventory Movement Ledger

Every stock change must create a permanent movement record.

Movement types include:

* Opening stock.
* Incoming-order receipt.
* Direct warehouse receipt.
* Warehouse-to-shop transfer.
* Shop-to-warehouse transfer.
* Shop-to-shop transfer, if enabled.
* Sale.
* Sale cancellation.
* Customer return.
* Stock correction.

Every movement records:

* Product.
* Quantity.
* Movement type.
* Source location, if applicable.
* Destination location, if applicable.
* Related transaction type.
* Related transaction ID.
* User.
* Date and time.
* Notes.

This ledger is the historical source of truth.

A separate inventory-balance table may be used for performance, but every balance change must match a movement record.

⸻

30. Reports

Reports must remain simple and practical.

30.1 Warehouse Reports

* Current warehouse stock.
* Products received.
* Products transferred out.
* Stock corrections.
* Low-stock products.
* Out-of-stock products.
* Product movement history.

30.2 Shop Reports

For each shop:

* Current stock.
* Sales value.
* Money collected during sales.
* Later customer payments collected.
* Total cash collected.
* New debt created.
* Outstanding customer debt.
* Expenses.
* Difference between collected money and expenses.
* Low-stock products.
* Product movement history.

30.3 Incoming-Order Reports

* Ordered.
* Shipped.
* Partially received.
* Received.
* Cancelled.
* Ordered quantity.
* Received quantity.
* Remaining quantity.

30.4 Customer-Debt Reports

* Customers with outstanding debt.
* Total debt by customer.
* Total debt by shop.
* Fully unpaid sales.
* Partially paid sales.
* Payments received during a selected period.
* Settled debts.
* Outstanding debts.

30.5 Sales Reports

* Total sales value.
* Paid sales.
* Partially paid sales.
* Unpaid sales.
* Cancelled sales.
* Sales by shop.
* Sales by product.
* Sales by date.

30.6 Date Filters

Reports should support:

* Today.
* This week.
* This month.
* Custom date range.

30.7 Printing and Export

Browser printing may be supported.

CSV or Excel export is optional and should not delay the core system unless explicitly approved.

⸻

31. Search and Filtering

The user should be able to search by:

* Product name.
* Product code.
* Barcode, if used.
* Customer name.
* Customer phone.
* Sale reference.
* Payment reference.
* Order reference.
* Transfer reference.
* Expense reference.

Useful filters:

* Category.
* Shop.
* Status.
* Date.
* Payment status.
* Low stock.
* Active or archived.

⸻

32. Low-Stock Warnings

The system should visibly identify:

* Low-stock products.
* Out-of-stock products.
* Incoming orders not yet received.
* Partially received orders.
* Customers with outstanding debt.

Version 1 only requires in-application warnings.

Do not build WhatsApp, SMS, email, or push-notification integrations unless separately approved.

⸻

33. Application Settings

Keep settings limited.

Recommended settings:

* Business name.
* Business logo, optional.
* Central warehouse name.
* Default currency.
* Receipt footer.
* Default low-stock threshold, optional.
* Date and number formatting.

Do not create a large settings area.

⸻

34. Required Data Model

The exact implementation may vary, but the database should include equivalent entities.

User

* id
* name
* phoneOrUsername
* passwordHash
* role
* assignedShopId, nullable
* active
* createdAt
* updatedAt

Shop

* id
* name
* address, nullable
* phone, nullable
* active
* archivedAt, nullable
* createdAt
* updatedAt

Location

Recommended normalized model:

* id
* name
* type: warehouse or shop
* shopId, nullable
* active
* createdAt

There is one central warehouse location.

Category

* id
* name
* active
* createdAt
* updatedAt

Product

* id
* name
* sku, nullable
* barcode, nullable
* categoryId
* description, nullable
* imageUrl, nullable
* defaultPurchaseCost, nullable
* defaultSalePrice, nullable
* lowStockThreshold, nullable
* active
* archivedAt, nullable
* createdAt
* updatedAt

IncomingOrder

* id
* referenceNumber
* supplierName, nullable
* orderDate
* expectedArrivalDate, nullable
* status
* notes, nullable
* createdBy
* cancelledBy, nullable
* cancelledAt, nullable
* cancellationReason, nullable
* createdAt
* updatedAt

IncomingOrderItem

* id
* incomingOrderId
* productId
* quantityOrdered
* quantityReceived
* unitCost, nullable
* notes, nullable

StockReceipt

* id
* referenceNumber
* incomingOrderId, nullable
* receiptDate
* supplierName, nullable
* notes, nullable
* createdBy
* createdAt

StockReceiptItem

* id
* stockReceiptId
* productId
* quantity
* unitCost, nullable

InventoryBalance

* id
* locationId
* productId
* quantity
* updatedAt

Unique constraint:

* locationId
* productId

InventoryMovement

* id
* referenceNumber
* productId
* movementType
* quantity
* sourceLocationId, nullable
* destinationLocationId, nullable
* relatedEntityType, nullable
* relatedEntityId, nullable
* notes, nullable
* createdBy
* createdAt

StockTransfer

* id
* referenceNumber
* sourceLocationId
* destinationLocationId
* status
* transferDate
* notes, nullable
* createdBy
* reversedBy, nullable
* reversedAt, nullable
* reversalReason, nullable
* createdAt

StockTransferItem

* id
* stockTransferId
* productId
* quantity

Customer

* id
* name
* phone, nullable
* notes, nullable
* active
* createdAt
* updatedAt

Sale

* id
* referenceNumber
* shopId
* customerId, nullable
* customerNameSnapshot, nullable
* customerPhoneSnapshot, nullable
* status
* paymentStatus
* subtotal
* totalAmount
* amountPaid
* amountDue
* saleDate
* notes, nullable
* createdBy
* cancelledBy, nullable
* cancelledAt, nullable
* cancellationReason, nullable
* createdAt
* updatedAt

SaleItem

* id
* saleId
* productId
* productNameSnapshot
* quantity
* unitPrice
* unitCostSnapshot, nullable
* lineTotal

CustomerPayment

* id
* referenceNumber
* customerId
* shopId
* amount
* paymentDate
* debtBeforePayment
* debtAfterPayment
* notes, nullable
* status
* createdBy
* cancelledBy, nullable
* cancelledAt, nullable
* cancellationReason, nullable
* createdAt

PaymentAllocation

* id
* customerPaymentId
* saleId
* amountAllocated
* createdAt

ExpenseCategory

* id
* name
* active
* createdAt

Expense

* id
* referenceNumber
* shopId
* categoryId, nullable
* amount
* expenseDate
* description
* notes, nullable
* status
* createdBy
* cancelledBy, nullable
* cancelledAt, nullable
* cancellationReason, nullable
* createdAt
* updatedAt

StockCorrection

* id
* referenceNumber
* locationId
* productId
* adjustmentQuantity
* reason
* notes, nullable
* createdBy
* createdAt

AppSetting

* id
* key
* value
* updatedAt

⸻

35. Reference Numbers

Generate simple searchable references.

Examples:

* ORD-000001: incoming order.
* REC-000001: stock receipt.
* TRF-000001: transfer.
* SAL-000001: sale.
* PAY-000001: customer payment.
* EXP-000001: expense.
* ADJ-000001: stock correction.

Reference numbers must be unique.

⸻

36. Database Transaction Rules

All sensitive operations must use database transactions.

These include:

* Receiving an order.
* Direct stock receipt.
* Completing a transfer.
* Reversing a transfer.
* Completing a sale.
* Cancelling a sale.
* Registering a customer payment.
* Reversing a customer payment.
* Processing a return.
* Performing a stock correction.

Example sale transaction:

1. Validate role and shop.
2. Lock or safely read inventory balances.
3. Confirm sufficient stock.
4. Validate customer and payment.
5. Create the sale.
6. Create sale items.
7. Reduce stock.
8. Create inventory movements.
9. Create initial payment if applicable.
10. Allocate the payment.
11. Update balances.
12. Commit.

If any step fails, roll back everything.

⸻

37. Mandatory Data Integrity Rules

1. Stock must never become negative.
2. Customer debt must never become negative.
3. Every stock change must have a movement record.
4. Ordered products do not count as physical stock.
5. Only received products enter warehouse stock.
6. A transfer must update both locations together.
7. A debt sale requires a customer.
8. Amount paid cannot exceed sale total.
9. A later payment cannot exceed customer debt.
10. Completed transactions cannot be silently deleted.
11. Products with history are archived, not deleted.
12. Shops with history are archived, not deleted.
13. Sale prices are stored on sale items.
14. Old sales must not change when product defaults change.
15. Cancelled sales are excluded from active sales totals.
16. Cancelled payments are excluded from collected-money totals.
17. Cancelled expenses are excluded from expense totals.
18. Sale value and money collected must be reported separately.
19. Payment reversal must restore customer debt.
20. Sale cancellation must correctly restore stock and debt.
21. Backend validation is mandatory.
22. Frontend validation alone is not sufficient.

⸻

38. Interface and User Experience

38.1 General Design

The design should be:

* Clean.
* Modern.
* Professional.
* Mobile-first.
* Easy to understand.
* Fast to use.
* Suitable for Arabic and right-to-left display.

38.2 Common Actions

Frequently used actions should be highly visible:

* Sell.
* Receive Stock.
* Transfer.
* Register Payment.
* Add Expense.
* Print Receipt.

38.3 Forms

Forms should:

* Show only necessary fields.
* Clearly identify optional fields.
* Use searchable product selection.
* Allow new customer creation during a sale.
* Allow new product creation during an incoming order.
* Show automatic totals.
* Show remaining debt clearly.
* Prevent invalid quantities.

38.4 Status Labels

Use text labels, not color alone.

Examples:

* Available.
* Low Stock.
* Out of Stock.
* Ordered.
* Shipped.
* Partially Received.
* Received.
* Paid.
* Partially Paid.
* Unpaid.
* Cancelled.
* Archived.

38.5 Confirmation Messages

Use clear messages, such as:

* “Sale completed successfully.”
* “5 units transferred to Phone Shop.”
* “Customer payment recorded. Remaining debt: 7,000 MRU.”
* “The available quantity is only 3.”
* “A customer is required because part of the sale remains unpaid.”

⸻

39. PWA Requirements

The developer must configure:

* Web application manifest.
* Application icons.
* Application name.
* Short name.
* Theme color.
* Background color.
* Standalone mode.
* Service worker.
* Basic interface caching.
* Android installability.
* iPhone home-screen usage.
* Responsive pages.

Sensitive business information must not remain exposed on shared devices after logout.

The system should require authentication after session expiration.

⸻

40. Security Requirements

Minimum requirements:

* Hashed passwords or PINs.
* Secure authentication.
* Role-based server authorization.
* Input validation.
* Protection against unauthorized shop access.
* Environment variables for secrets.
* HTTPS in production.
* Secure session or cookie settings.
* Safe product-image uploads.
* No raw technical errors shown to users.
* Login rate limiting where practical.
* Database queries through a safe ORM or parameterized queries.

⸻

41. Backups and Production Reliability

The production environment must include:

* Daily automated PostgreSQL backups.
* Several recent backups retained.
* Documented restoration instructions.
* At least one tested restoration.
* Separate storage for backups where possible.
* Production environment variables.
* Error logging.
* Stable deployment process.

The developer must not consider the project finished without a documented backup and restore method.

⸻

42. Error Handling

User-facing errors must be understandable.

Examples:

* “This sale cannot be completed because the product is out of stock.”
* “The customer only owes 5,000 MRU.”
* “The paid amount cannot be greater than the sale total.”
* “You do not have permission to access this shop.”
* “The transfer failed. No stock was changed.”
* “This product has transaction history and can only be archived.”

Technical stack traces must never be shown to normal users.

⸻

43. Features Explicitly Outside the Scope

Do not add the following unless separately approved:

* Full accounting.
* Double-entry bookkeeping.
* Supplier debt management.
* Supplier-payment schedules.
* Payroll.
* Employee attendance.
* Customer interest or late fees.
* Automatic installment schedules.
* Customer credit balances.
* Automatic debt reminders.
* WhatsApp integration.
* SMS integration.
* Shipping-company integration.
* Customs management.
* Delivery-driver management.
* E-commerce website.
* Online customer ordering.
* Online payment gateway.
* Loyalty points.
* Advanced CRM.
* Multiple warehouses.
* Complex multi-currency accounting.
* Tax or fiscal invoicing.
* Complex barcode hardware integration.
* Complex offline synchronization.
* Advanced approval workflows.
* Advanced analytics or business-intelligence dashboards.

Do not add features simply because other inventory systems have them.

⸻

44. Development Phases

Phase 1: Project Foundation

* Create frontend and backend structure.
* Configure TypeScript.
* Configure PostgreSQL.
* Configure ORM and migrations.
* Create authentication.
* Create roles.
* Create responsive layout.
* Configure PWA foundation.
* Add application settings.

Phase 2: Core Master Data

* Categories.
* Products.
* Product archiving.
* Shops.
* Locations.
* Users.
* Customer records.
* Expense categories.

Phase 3: Warehouse and Incoming Orders

* Incoming-order creation.
* New product creation during orders.
* Order statuses.
* Full receiving.
* Partial receiving.
* Direct warehouse receipt.
* Initial stock.
* Warehouse balances.
* Inventory movements.

Phase 4: Transfers and Shop Inventory

* Warehouse-to-shop transfer.
* Shop-to-warehouse transfer.
* Optional shop-to-shop transfer.
* Transfer validation.
* Transfer reversal.
* Independent shop stock.
* Low-stock indicators.

Phase 5: Sales and Customer Debt

* Multi-item sale.
* Flexible negotiated pricing.
* Optional customer for paid sales.
* Mandatory customer for debt.
* Paid sale.
* Partial-payment sale.
* Full-debt sale.
* Stock deduction.
* Initial payment recording.
* Debt calculation.
* Payment status.

Phase 6: Customer Payments and Receipts

* Customer account page.
* Debt history.
* Later payment registration.
* Oldest-debt-first allocation.
* Payment cancellation.
* Sale receipt.
* Debt payment receipt.
* Receipt reprinting.
* Browser printing.

Phase 7: Expenses and Reports

* Expense entry.
* Expense cancellation.
* Warehouse reports.
* Shop reports.
* Sales reports.
* Cash-collected reports.
* Debt reports.
* Customer reports.
* Date filters.
* Dashboard summaries.

Phase 8: Hardening and Deployment

* Permission testing.
* Transaction testing.
* Stock-integrity testing.
* Debt-integrity testing.
* Responsive testing.
* PWA installation testing.
* Receipt-printing testing.
* Backup testing.
* Production deployment.
* Admin account setup.
* Initial data setup.

⸻

45. Required Test Scenarios

Products

* Create product without any price.
* Create product with suggested prices.
* Edit product.
* Confirm old sales do not change.
* Archive product with history.
* Restore archived product.
* Delete product with no history.
* Prevent deletion of product with history.

Incoming Orders

* Create order for existing product.
* Create new product during an order.
* Receive full order.
* Receive partial order.
* Receive remaining quantity later.
* Cancel order.
* Confirm unreceived stock is not in warehouse.
* Prevent invalid received quantity.

Initial Stock and Warehouse

* Enter warehouse opening stock.
* Enter shop opening stock.
* Add direct warehouse receipt.
* Perform stock correction.
* Confirm movement ledger.
* Prevent negative stock.

Transfers

* Transfer warehouse stock to Shop 1.
* Confirm warehouse decreases.
* Confirm Shop 1 increases.
* Prevent transfer above available quantity.
* Prevent same source and destination.
* Return product to warehouse.
* Reverse transfer.
* Confirm rollback if one part fails.

Fully Paid Sales

* Sell product with suggested price.
* Change price during sale.
* Sell product without suggested price.
* Sell multiple products.
* Complete paid sale without customer.
* Complete paid sale with customer.
* Print receipt.
* Reprint old receipt.

Debt Sales

* Create partial-payment sale.
* Create full-debt sale.
* Require customer when debt exists.
* Calculate remaining debt correctly.
* Show payment status.
* Print receipt with paid and remaining amounts.
* Confirm stock is deducted normally.

Customer Payments

* Register partial debt payment.
* Register payment settling one sale.
* Register payment covering several sales.
* Allocate payment to oldest debt.
* Prevent payment above customer debt.
* Update customer balance.
* Update sale payment status.
* Print payment receipt.
* Reprint payment receipt.

Cancellations

* Cancel fully unpaid sale.
* Restore stock.
* Remove related debt.
* Cancel paid sale correctly.
* Prevent ordinary user from cancelling protected sale.
* Reverse customer payment.
* Restore customer debt.
* Exclude reversed payment from collected-money totals.
* Preserve cancelled records.

Expenses

* Add expense.
* Edit authorized expense.
* Cancel expense.
* Exclude cancelled expense from totals.
* Filter by shop and date.

Reports

* Sales value differs from money collected.
* Later debt payment affects cash but not current sales.
* Outstanding debt equals unpaid sale balances.
* Reports filter correctly by shop.
* Reports filter correctly by date.
* Cancelled transactions are excluded.

Permissions

* Owner sees everything.
* Warehouse employee sees permitted warehouse sections.
* Shop employee sees assigned shop only.
* Shop employee cannot access another shop by URL.
* Unauthorized employee cannot reverse payments.
* Unauthorized employee cannot perform corrections.

PWA and Devices

* Install on Android.
* Add to home screen on iPhone.
* Open in standalone mode.
* Test common phone screen sizes.
* Test laptop layout.
* Confirm print view works.
* Confirm logout removes access.

⸻

46. Acceptance Criteria

The application is complete only when all the following are working.

1. Users can log in securely.
2. Roles and shop restrictions work.
3. Products can be created without prices.
4. Products can have negotiable prices during sales.
5. Categories can be created.
6. Shops can be created.
7. Users can be assigned to shops.
8. Incoming orders can be registered.
9. New products can be created during orders.
10. Full and partial order receipts work.
11. Only received quantities enter warehouse stock.
12. Direct warehouse receipts work.
13. Initial stock can be entered.
14. Warehouse stock is searchable.
15. Products can be transferred to shops.
16. Both transfer locations update correctly.
17. Each shop has separate stock.
18. Sales can contain multiple products.
19. Sales reduce shop stock.
20. Paid sales work.
21. Partial-payment sales work.
22. Full-debt sales work.
23. Debt sales require a customer.
24. Customer accounts show correct balances.
25. Later customer payments can be recorded.
26. Payments update sale balances.
27. Payments can cover multiple sales.
28. Sales value and cash collected are separate.
29. Outstanding debt is reported correctly.
30. Sale receipts can be printed.
31. Payment receipts can be printed.
32. Old receipts can be reprinted.
33. Expenses can be recorded by shop.
34. Reports work by shop and date.
35. Product movement history is complete.
36. Stock corrections are recorded.
37. Completed transactions cannot be silently deleted.
38. Products and shops with history are archived.
39. Negative stock is impossible.
40. Negative customer debt is impossible.
41. Critical operations use database transactions.
42. The system works on phones and computers.
43. The system can be installed on Android and iPhone as a PWA.
44. Backups and restoration are documented.
45. The production system is securely deployed.

⸻

47. Instructions for the Developer’s AI

Before coding:

1. Read the entire document.
2. Explain the business workflow in your own words.
3. Identify the core data entities.
4. Identify the stock-integrity rules.
5. Identify the debt and payment-integrity rules.
6. Review the existing codebase, if one exists.
7. Produce a phased implementation plan.
8. Do not begin implementation until the plan is internally consistent.
9. Do not invent additional modules.
10. Preserve the project’s simplicity.

During implementation:

1. Build in controlled phases.
2. Complete the data model before visual polish.
3. Use proper database migrations.
4. Use server-side validation.
5. Use database transactions for critical actions.
6. Test every stock-changing action.
7. Test every debt-changing action.
8. Inspect database records after tests.
9. Fix discovered gaps before proceeding.
10. Keep a checklist of acceptance criteria.
11. Reuse components where appropriate.
12. Avoid unnecessary abstractions and complexity.
13. Never mark a feature complete because only the interface exists.
14. Confirm the full workflow works from beginning to end.

After each phase:

1. Compare the work against this document.
2. Run relevant test scenarios.
3. Verify role permissions.
4. Verify stock balances.
5. Verify customer debt.
6. Verify reports.
7. Fix all failures.
8. Continue until acceptance criteria are met.

Before final handover:

1. Test the system with realistic business examples.
2. Test on Android and iPhone.
3. Test receipt printing.
4. Test user permissions.
5. Test cancellations and reversals.
6. Test database backup and restoration.
7. Confirm that no excluded feature was unnecessarily added.
8. Confirm that the system remains simple for the client.

⸻

48. Final Product Vision

The finished application should allow the owner to understand the business from one simple system.

The owner should be able to see:

* What products were ordered.
* What is still in transit.
* What arrived.
* What is in the warehouse.
* What was sent to each shop.
* What remains inside each shop.
* What was sold.
* The actual negotiated sale price.
* How much the customer paid.
* How much the customer still owes.
* What payments the customer made later.
* What receipt was issued.
* What each shop collected.
* What each shop spent.
* The complete history of every product and transaction.

The final system must be simple enough for daily shop use, while being reliable enough to protect stock, sales, cash, and customer-debt records.