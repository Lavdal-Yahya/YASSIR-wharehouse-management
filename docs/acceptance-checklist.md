# Acceptance Checklist (Spec §46)

Check off each item during final pre-handover testing.

---

## Auth & Permissions

- [ ] 1. Users can log in securely (session cookie, httpOnly)
- [ ] 2. Role-based access works: OWNER sees everything; SHOP sees only own shop; WAREHOUSE sees stock, not financials

## Catalogue

- [ ] 3. Products can be created without prices
- [ ] 4. Products can have negotiable prices entered per sale line
- [ ] 5. Categories can be created and assigned to products
- [ ] 6. Shops can be created and named
- [ ] 7. Users can be assigned to shops (SHOP role)

## Ordering & Receiving

- [ ] 8. Incoming orders can be registered (supplier + expected lines)
- [ ] 9. New products can be created inline during order entry
- [ ] 10. Full and partial order receipts work (only received qty enters stock)
- [ ] 11. Only received quantities enter warehouse stock (order lines track expected vs received)
- [ ] 12. Direct warehouse receipts work (without a prior order)
- [ ] 13. Initial opening stock can be entered

## Stock

- [ ] 14. Warehouse stock is searchable and filterable
- [ ] 15. Products can be transferred from warehouse to shops
- [ ] 16. Both warehouse and shop stock update correctly on transfer
- [ ] 17. Each shop has separate, isolated stock ledger

## Sales

- [ ] 18. Sales can contain multiple products with individual prices
- [ ] 19. Sales reduce shop stock atomically
- [ ] 20. Paid-in-full sales work and show PAID status
- [ ] 21. Partial-payment sales work and show PARTIALLY_PAID status
- [ ] 22. Full-debt (zero upfront) sales work and show UNPAID status
- [ ] 23. Debt sales require a linked customer (rejected without one)

## Customer Accounts & Payments

- [ ] 24. Customer account page shows correct outstanding balance
- [ ] 25. Later payments can be registered against a customer
- [ ] 26. Payments update the balances of the covered sales (oldest-first)
- [ ] 27. A single payment can cover multiple open sales
- [ ] 28. Sale value (totalAmount) and cash collected (amountPaid) are tracked separately
- [ ] 29. Outstanding debt report shows correct totals per customer

## Receipts

- [ ] 30. Sale receipts can be printed (clean print view, no app chrome)
- [ ] 31. Payment receipts can be printed
- [ ] 32. Old receipts can be reprinted from the detail page (snapshot values preserved)

## Expenses & Reports

- [ ] 33. Expenses can be recorded per shop with categories
- [ ] 34. Reports filter correctly by shop and date range
- [ ] 35. Product movement history is complete (in/out/transfer/correction)
- [ ] 36. Stock corrections are recorded with a reason

## Data Integrity

- [ ] 37. Completed transactions cannot be silently deleted (only cancelled/reversed with reason)
- [ ] 38. Products and shops with history are archived, not deleted
- [ ] 39. Negative stock is impossible (server rejects at transaction level)
- [ ] 40. Negative customer debt is impossible (overpayment is prevented)
- [ ] 41. Critical operations (sales, transfers, payments) use database transactions

## Device & PWA

- [ ] 42. The system works on phones and desktop browsers (responsive layout)
- [ ] 43. The system can be installed as a PWA on Android and iPhone

## Operations

- [ ] 44. Backups and restoration are documented and the restore procedure has been rehearsed
- [ ] 45. The production system is securely deployed (HTTPS, env secrets, no debug endpoints)
