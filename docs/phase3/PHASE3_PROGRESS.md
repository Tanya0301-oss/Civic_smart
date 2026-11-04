### M1.8-D — Safe Officer Allocation

**Status: FUNCTIONALLY VERIFIED — API actor representation discrepancy pending**

Implemented and tested safe officer allocation through the PostgreSQL stored procedure.

**Verified implementation**

- Unique partial index prevents multiple active assignments per complaint.
- Validates complaint eligibility, officer availability, department/skills, ward coverage and capacity.
- Locks complaint and officer records to protect concurrent allocations.
- Creates assignment, assignment history and notifications in one transaction.
- Supports direct allocation and C++ scheduler-driven allocation.
- Scheduler selects the complaint; Flask selects an eligible officer and invokes the three-parameter allocation procedure.
- Removed obsolete two-parameter procedure overload.
- Removed duplicate manual complaint status-history insertion.

**Verification evidence**

- Direct allocation: passed.
- Duplicate allocation rejection: passed.
- Department/skill and ward validation: passed.
- Capacity enforcement: passed.
- Transaction rollback: passed.
- Concurrent allocation: passed; officer capacity was not exceeded.
- C++ scheduler integration: passed.
- CS1060 assigned to OFF-EL-118 with PENDING_ACCEPTANCE state.
- Assignment history: exactly one initial record.
- Complaint status history: exactly one Verified-to-Assigned transition.
- Notifications: expected ADMIN, CITIZEN and OFFICER records created.
- CS1000012 remained unchanged.

**Outstanding item**

- API assignment response actor string differs from the actor stored in PostgreSQL. The scheduler route passes `M1.8-D C++ Scheduler` to the procedure and returns the fetched assignment row directly; the assignments endpoint also copies the database `actor` field directly. No response-side actor formatting was found. Compare the raw response JSON and the response from the same Flask process to identify where the reported missing space occurs.

**Database:** civic_smart_m1_8c_test

**Test assignment:** ASN-1349c0ab96334c4ca4c1d39d77ccf546

**Test complaint:** CS1060
