# Civic Smart — OS Backend & Scheduling Engine (C++)

**Project Title:** Civic Smart — An OS and DBMS-Based Civic Grievance and Municipal Workflow Management System  
**Team Name:** City Solvers  
**Project Code:** OSDBMS-V-2026-T227  
**Module:** Operating Systems Scheduling Engine & Process Management  

---

## 1. What is the Role of the OS Backend in Civic Smart?

In a city, hundreds of civic issues (potholes, water pipe ruptures, overflowing dumpsters, broken streetlights) occur every day. If complaints are handled on a simple **First-Come, First-Served (FCFS)** basis, a trivial cosmetic complaint could block an emergency hazardous situation (like a sparking electrical pole or flooding drinking water pipeline).

This C++ engine acts as the **Central Operating System Kernel / Scheduler** of the municipality:
- Each **complaint** is treated as a **Process (Job)** with its own **Process Control Block (PCB)**.
- Each **municipal field repair team** represents a **CPU Core / Resource**.
- The **Scheduler** organizes complaints into **Multilevel Feedback Queues (MLQ)** based on dynamic priority scores.
- An **Aging Algorithm** prevents starvation of routine issues.

---

## 2. Mapping of Operating System Concepts to C++ Code

| OS Concept | Real-World Civic Mapping | C++ Implementation Construct in `civic_os_engine.cpp` |
| :--- | :--- | :--- |
| **Process Control Block (PCB)** | Every complaint's identity, metadata, priority, and history | `struct ComplaintPCB` holding `id`, `title`, `state`, `priorityScore`, `waitingDays`, `duplicateCount` |
| **Process State Machine** | Lifecycle of a municipal complaint | `enum class ProcessState { NEW, READY, RUNNING, WAITING, TERMINATED }` |
| **Ready Queue** | Staging line of complaints awaiting field teams | `vector<ComplaintPCB> queue0, queue1, queue2` |
| **Priority Scheduling** | Dynamic urgency calculation based on severity & public reports | `ComplaintPCB::calculatePriority()` |
| **Multilevel Queue (MLQ)** | Tiering complaints by urgency SLA | **Queue 0** (Score $\ge 85$), **Queue 1** ($70 \le \text{Score} < 85$), **Queue 2** ($\text{Score} < 70$) |
| **Aging (Anti-Starvation)** | Older pending complaints gain priority so they aren't ignored | `CivicScheduler::simulateAgingDay()` increments `waitingDays` and boosts score |
| **Dispatcher / Context Switch** | Assigning highest priority ready job to field workers | `CivicScheduler::dispatchNext()` moves task from `READY` to `RUNNING` |
| **I/O Block / Waiting State** | Complaint paused due to missing asphalt, pipes, or permits | `CivicScheduler::blockComplaint()` moves task from `RUNNING` to `WAITING` |
| **Process Termination** | Complaint resolved, inspected, and closed | `CivicScheduler::resolveComplaint()` moves task to `TERMINATED` |

---

## 3. The Scheduling Math (Formula)

In `civic_os_engine.cpp`, every complaint's priority is computed dynamically:

$$\text{Priority Score} = \text{Base Severity} + \text{Duplicate Boost} + \text{Aging Boost}$$

1. **Base Severity**:
   - `Critical` = 90 points (e.g. fallen tree on power transformer)
   - `High` = 75 points (e.g. road cave-in or water main burst)
   - `Medium` = 60 points (e.g. overflowing garbage)
   - `Low` = 40 points (e.g. cracked footpath)
2. **Duplicate Boost**:
   - Each additional citizen report about the same location adds $+2$ points:
     $$\text{Duplicate Boost} = (\text{Duplicate Count} - 1) \times 2$$
3. **Aging Boost**:
   - For every day the complaint sits pending in the queue, it gains $+2$ points:
     $$\text{Aging Boost} = \text{Waiting Days} \times 2$$

---

## 4. How to Compile and Run

### Option A: Using the One-Click Batch Script
Double-click `compile_and_run.bat` in the `cpp_os_backend` folder.

### Option B: Using the Command Line
Open PowerShell or Command Prompt in `cpp_os_backend` and run:
```bash
g++ -std=c++11 civic_os_engine.cpp -o civic_os_engine.exe
.\civic_os_engine.exe
```

---

## 5. Interactive Console Menu Options

When the program runs, you will see the interactive simulator menu:
```
============================================================
      CIVIC SMART - OS BACKEND SIMULATION CONSOLE
  Team: City Solvers | Module: OS Scheduling Engine
============================================================
 1. Display Multilevel Queues (MLQ Status)
 2. Dispatch Next Highest Priority Task (RUNNING)
 3. Simulate Aging (24-Hour Time Step & Priority Boost)
 4. Add Duplicate Report (Simulate Duplicate Clustering)
 5. Register New Citizen Complaint (NEW -> READY)
 6. Block Complaint on Resource (RUNNING -> WAITING)
 7. Resolve / Terminate Complaint (RUNNING -> TERMINATED)
 8. Export Queues to JSON (For Web Frontend Sync)
 9. Exit
```

---

## 6. How it Integrates with the Web Frontend

When you choose **Option 8 (Export Queues to JSON)** in the C++ console:
- The scheduler writes `scheduled_complaints.json`.
- This JSON contains the ranked complaints, their priority scores, their assigned queues (Queue 0, 1, or 2), and their states (`READY`, `RUNNING`, `WAITING`, `TERMINATED`).
- The web frontend (`admin.html` and `track.html`) reads this structured data, showing live updates on the municipal authority dashboard.

---

## 7. Viva / Evaluation Cheat Sheet (Questions the Professor Might Ask)

**Q1: Why did you use C++ for the OS module?**
> *"Operating systems are written in low-level, high-performance languages like C and C++. Using C++ allows us to model exact operating system data structures like Process Control Blocks, priority queues, and state transitions with efficiency and clarity."*

**Q2: What is the Process Control Block (PCB) in your project?**
> *"In an OS, a PCB stores process metadata (PID, state, program counter, priority). In our system, `struct ComplaintPCB` acts as the PCB, storing the Complaint ID, title, process state (`NEW`, `READY`, `RUNNING`, `WAITING`, `TERMINATED`), base severity, waiting days, and priority score."*

**Q3: What is Starvation and how did you prevent it?**
> *"Starvation occurs when low-priority complaints (like a broken street light) never get addressed because high-priority complaints (like pipeline ruptures) keep arriving. We solved this using the **Aging** mechanism: every 24 hours, pending complaints gain $+2$ priority points, eventually promoting them into high-priority queues."*

**Q4: Why Multilevel Queue instead of a single queue?**
> *"A single queue cannot differentiate service-level agreements (SLAs). Multilevel Queues allow us to separate emergency critical issues ($Q_0$, preemptive immediate dispatch) from standard routine maintenance ($Q_1$ and $Q_2$)."*
