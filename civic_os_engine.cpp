/**
 * ============================================================================
 * CIVIC SMART - OS SCHEDULING ENGINE (C++ Backend)
 * Project Code: OSDBMS-V-2026-T227
 * Team: City Solvers | Member Focus: OS / Scheduling Logic
 * ============================================================================
 * 
 * This program implements the Operating System concepts described in the report:
 * 1. Process Control Block (PCB): Represented by `struct ComplaintPCB`.
 * 2. Process States: NEW, READY, RUNNING, WAITING, TERMINATED.
 * 3. Priority Scheduling Algorithm:
 *       Priority = Base Severity + (Duplicates * Boost) + (Waiting Time * Aging Rate)
 * 4. Multilevel Feedback Queue (MLQ / MLFQ):
 *       - Queue 0 (Critical Tier):  Priority >= 85 (Preemptive dispatch)
 *       - Queue 1 (High Tier):      70 <= Priority < 85 (48h SLA)
 *       - Queue 2 (Normal Tier):    Priority < 70 (Subject to Aging promotion)
 * 5. Aging Mechanism: Prevents starvation of low-priority civic issues.
 * 6. Dispatcher & State Transitions: Simulates CPU/Workforce assignment.
 * 7. JSON Export / Import: For direct integration with the Web Frontend & DBMS.
 * ============================================================================
 */

#include <iostream>
#include <vector>
#include <string>
#include <iomanip>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <ctime>

using namespace std;

// ----------------------------------------------------------------------------
// 1. PROCESS STATES (Operating Systems Lifecycle)
// ----------------------------------------------------------------------------
enum class ProcessState {
    NEW,        // Complaint just reported by citizen
    READY,      // Evaluated and waiting in the Multilevel Queue
    RUNNING,    // Assigned to field team / work actively in progress
    WAITING,    // Blocked on resources (spare parts, heavy machinery, road closure)
    TERMINATED  // Work completed, audited, and resolved
};

// Helper function to convert enum to string
string stateToString(ProcessState state) {
    switch (state) {
        case ProcessState::NEW:        return "NEW";
        case ProcessState::READY:      return "READY";
        case ProcessState::RUNNING:    return "RUNNING";
        case ProcessState::WAITING:    return "WAITING";
        case ProcessState::TERMINATED: return "TERMINATED";
        default:                       return "UNKNOWN";
    }
}

// ----------------------------------------------------------------------------
// 2. AUDIT TRAIL / STATUS HISTORY ENTRY (DBMS + OS Audit)
// ----------------------------------------------------------------------------
struct StatusHistoryEntry {
    string fromState;
    string toState;
    string timestamp;
    string remarks;
};

// ----------------------------------------------------------------------------
// 3. PROCESS CONTROL BLOCK (PCB)
// In an OS, each process has a PCB. In Civic Smart, each complaint is a PCB.
// ----------------------------------------------------------------------------
struct ComplaintPCB {
    string id;              // Process ID / Complaint ID (e.g., "CS1024")
    string title;           // Problem summary
    string category;        // Civic category (Roads, Water, Waste, Lighting, Drainage)
    string location;        // Landmark / GPS coords
    string ward;            // Municipal zone
    string department;      // Assigned municipal department
    
    // Priority calculation attributes
    int baseSeverity;       // Base score: Low(40), Medium(60), High(75), Critical(90)
    int duplicateCount;     // Number of citizen reports merged for this same issue
    int duplicateBoost;     // Boost added due to duplicate reports (+2 per duplicate)
    int waitingDays;        // Number of days complaint has been pending
    int agingRate;          // Aging points gained per day pending (default: 2 pts/day)
    int agingBoost;         // Current aging boost (waitingDays * agingRate)
    int priorityScore;      // Total dynamic priority score (capped at 99)
    
    // Scheduling queue placement
    int queueLevel;         // 0: Critical, 1: High, 2: Normal
    ProcessState state;     // Current process state
    
    vector<StatusHistoryEntry> history; // Audit log of state transitions

    // Constructor
    ComplaintPCB(string _id = "", string _title = "", string _category = "", 
                 string _location = "", string _ward = "", string _dept = "", 
                 int _baseSev = 60, int _duplicates = 1, int _waitDays = 0)
        : id(_id), title(_title), category(_category), location(_location), 
          ward(_ward), department(_dept), baseSeverity(_baseSev), 
          duplicateCount(_duplicates), waitingDays(_waitDays), 
          agingRate(2), state(ProcessState::NEW) {
        
        calculatePriority();
        logTransition("NONE", "NEW", "Complaint created and initialized in PCB table.");
    }

    // Dynamic Priority Calculation Formula:
    // Priority = Base Severity + Duplicate Boost + Aging Boost
    void calculatePriority() {
        duplicateBoost = (duplicateCount > 1) ? (duplicateCount - 1) * 2 : 0;
        agingBoost = waitingDays * agingRate;
        
        priorityScore = baseSeverity + duplicateBoost + agingBoost;
        if (priorityScore > 99) priorityScore = 99; // Cap at 99

        // Multilevel Queue Assignment:
        if (priorityScore >= 85) {
            queueLevel = 0; // Critical Tier
        } else if (priorityScore >= 70) {
            queueLevel = 1; // High Priority Tier
        } else {
            queueLevel = 2; // Normal Priority Tier
        }
    }

    // State Transition Logger
    void logTransition(string from, string to, string remark) {
        time_t now = time(0);
        char buf[80];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", localtime(&now));
        history.push_back({from, to, string(buf), remark});
    }

    // Update process state
    void setState(ProcessState newState, string remarks = "") {
        string oldStr = stateToString(state);
        string newStr = stateToString(newState);
        state = newState;
        logTransition(oldStr, newStr, remarks);
    }

    // Age complaint by 1 day (Anti-Starvation Mechanism)
    void age() {
        if (state != ProcessState::TERMINATED) {
            waitingDays++;
            calculatePriority();
        }
    }
};

// ----------------------------------------------------------------------------
// 4. MULTILEVEL FEEDBACK QUEUE (MLFQ) SCHEDULER
// ----------------------------------------------------------------------------
class CivicScheduler {
private:
    vector<ComplaintPCB> queue0; // Queue 0: Critical (Score >= 85)
    vector<ComplaintPCB> queue1; // Queue 1: High (70 <= Score < 85)
    vector<ComplaintPCB> queue2; // Queue 2: Normal (Score < 70)
    vector<ComplaintPCB> runningList;    // Actively dispatched / in progress
    vector<ComplaintPCB> waitingList;    // Blocked on equipment/materials
    vector<ComplaintPCB> terminatedList; // Successfully resolved

public:
    CivicScheduler() {}

    // Add a new complaint to the scheduler
    void addComplaint(ComplaintPCB pcb) {
        pcb.setState(ProcessState::READY, "Placed into Ready Queue.");
        insertIntoQueue(pcb);
    }

    // Place a PCB into its respective queue based on queueLevel
    void insertIntoQueue(const ComplaintPCB& pcb) {
        if (pcb.queueLevel == 0) {
            queue0.push_back(pcb);
            sortQueue(queue0);
        } else if (pcb.queueLevel == 1) {
            queue1.push_back(pcb);
            sortQueue(queue1);
        } else {
            queue2.push_back(pcb);
            sortQueue(queue2);
        }
    }

    // Sort queue by Priority Score descending (Priority Scheduling)
    void sortQueue(vector<ComplaintPCB>& q) {
        sort(q.begin(), q.end(), [](const ComplaintPCB& a, const ComplaintPCB& b) {
            return a.priorityScore > b.priorityScore;
        });
    }

    // ------------------------------------------------------------------------
    // OS AGING MECHANISM:
    // Increments waiting time of all ready complaints. If priority score passes
    // a threshold, the task is dynamically promoted to a higher queue tier.
    // ------------------------------------------------------------------------
    void simulateAgingDay() {
        cout << "\n>>> [OS SCHEDULER] Simulating 24 Hours Passage (Aging Applied)... <<<\n";
        
        // Collect all ready complaints from all queues
        vector<ComplaintPCB> allReady;
        for (auto& c : queue0) { c.age(); allReady.push_back(c); }
        for (auto& c : queue1) { c.age(); allReady.push_back(c); }
        for (auto& c : queue2) { c.age(); allReady.push_back(c); }

        // Clear existing queues and re-sort / re-tier
        queue0.clear();
        queue1.clear();
        queue2.clear();

        for (auto& c : allReady) {
            insertIntoQueue(c);
        }

        // Also age waiting processes
        for (auto& c : waitingList) {
            c.age();
        }
    }

    // ------------------------------------------------------------------------
    // DISPATCHER:
    // Preemptive priority dispatch. Always serves Queue 0 first, then Queue 1,
    // then Queue 2 (Multilevel Priority Dispatching).
    // ------------------------------------------------------------------------
    bool dispatchNext() {
        ComplaintPCB* target = nullptr;
        int fromQueue = -1;

        if (!queue0.empty()) {
            target = &queue0.front();
            fromQueue = 0;
        } else if (!queue1.empty()) {
            target = &queue1.front();
            fromQueue = 1;
        } else if (!queue2.empty()) {
            target = &queue2.front();
            fromQueue = 2;
        }

        if (target == nullptr) {
            cout << "No pending complaints ready for dispatch.\n";
            return false;
        }

        ComplaintPCB dispatched = *target;
        if (fromQueue == 0) queue0.erase(queue0.begin());
        else if (fromQueue == 1) queue1.erase(queue1.begin());
        else if (fromQueue == 2) queue2.erase(queue2.begin());

        dispatched.setState(ProcessState::RUNNING, "Dispatched to Municipal Field Team (Lane " + to_string(fromQueue) + ").");
        runningList.push_back(dispatched);

        cout << "\n[DISPATCHER] Dispatched Complaint #" << dispatched.id 
             << " (\"" << dispatched.title << "\") from Queue " << fromQueue 
             << " | Priority Score: " << dispatched.priorityScore << " -> State: RUNNING\n";
        return true;
    }

    // Transition a RUNNING complaint to WAITING (Blocked on materials/parts)
    bool blockComplaint(string complaintId, string reason) {
        for (auto it = runningList.begin(); it != runningList.end(); ++it) {
            if (it->id == complaintId) {
                ComplaintPCB p = *it;
                runningList.erase(it);
                p.setState(ProcessState::WAITING, "Blocked: " + reason);
                waitingList.push_back(p);
                cout << "\n[PROCESS MANAGER] #" << p.id << " transitioned to WAITING (Reason: " << reason << ")\n";
                return true;
            }
        }
        cout << "Complaint #" << complaintId << " not found in RUNNING list.\n";
        return false;
    }

    // Transition a WAITING complaint back to READY
    bool unblockComplaint(string complaintId) {
        for (auto it = waitingList.begin(); it != waitingList.end(); ++it) {
            if (it->id == complaintId) {
                ComplaintPCB p = *it;
                waitingList.erase(it);
                p.setState(ProcessState::READY, "Resource acquired. Returned to Ready Queue.");
                insertIntoQueue(p);
                cout << "\n[PROCESS MANAGER] #" << p.id << " unblocked and returned to Ready Queue.\n";
                return true;
            }
        }
        cout << "Complaint #" << complaintId << " not found in WAITING list.\n";
        return false;
    }

    // Resolve a complaint (RUNNING -> TERMINATED)
    bool resolveComplaint(string complaintId, string auditNote = "Field verification completed.") {
        for (auto it = runningList.begin(); it != runningList.end(); ++it) {
            if (it->id == complaintId) {
                ComplaintPCB p = *it;
                runningList.erase(it);
                p.setState(ProcessState::TERMINATED, auditNote);
                terminatedList.push_back(p);
                cout << "\n[RESOLUTION AUDIT] Complaint #" << p.id << " marked TERMINATED / RESOLVED.\n";
                return true;
            }
        }
        // Also check waiting list
        for (auto it = waitingList.begin(); it != waitingList.end(); ++it) {
            if (it->id == complaintId) {
                ComplaintPCB p = *it;
                waitingList.erase(it);
                p.setState(ProcessState::TERMINATED, auditNote);
                terminatedList.push_back(p);
                cout << "\n[RESOLUTION AUDIT] Complaint #" << p.id << " marked TERMINATED / RESOLVED.\n";
                return true;
            }
        }
        cout << "Complaint #" << complaintId << " not found in RUNNING or WAITING lists.\n";
        return false;
    }

    // Add duplicate report to an existing complaint (Duplicate Clustering)
    bool addDuplicateReport(string complaintId) {
        auto checkAndBoost = [&](vector<ComplaintPCB>& q) {
            for (auto& c : q) {
                if (c.id == complaintId) {
                    c.duplicateCount++;
                    c.calculatePriority();
                    return true;
                }
            }
            return false;
        };

        if (checkAndBoost(queue0) || checkAndBoost(queue1) || checkAndBoost(queue2) || 
            checkAndBoost(runningList) || checkAndBoost(waitingList)) {
            cout << "\n[DUPLICATE DETECTOR] Duplicate linked to #" << complaintId 
                 << "! Duplicate boost applied.\n";
            // Re-sort queues
            resortAllQueues();
            return true;
        }
        cout << "Complaint #" << complaintId << " not found.\n";
        return false;
    }

    void resortAllQueues() {
        vector<ComplaintPCB> all;
        all.insert(all.end(), queue0.begin(), queue0.end());
        all.insert(all.end(), queue1.begin(), queue1.end());
        all.insert(all.end(), queue2.begin(), queue2.end());
        queue0.clear(); queue1.clear(); queue2.clear();
        for (auto& c : all) insertIntoQueue(c);
    }

    // ------------------------------------------------------------------------
    // DISPLAY: Print Multilevel Queues in ASCII Table
    // ------------------------------------------------------------------------
    void printQueueStatus() const {
        cout << "\n" << string(85, '=') << "\n";
        cout << "              CIVIC SMART - MULTILEVEL QUEUE STATUS (OS SCHEDULER)\n";
        cout << string(85, '=') << "\n";

        auto printHeader = []() {
            cout << left << setw(10) << "ID"
                 << setw(26) << "Title"
                 << setw(16) << "Category"
                 << setw(8)  << "Score"
                 << setw(12) << "State"
                 << setw(13) << "Wait/Aging"
                 << "\n";
            cout << string(85, '-') << "\n";
        };

        auto printRow = [](const ComplaintPCB& c) {
            string shortTitle = c.title.length() > 24 ? c.title.substr(0, 21) + "..." : c.title;
            cout << left << setw(10) << ("#" + c.id)
                 << setw(26) << shortTitle
                 << setw(16) << c.category
                 << setw(8)  << c.priorityScore
                 << setw(12) << stateToString(c.state)
                 << setw(13) << (to_string(c.waitingDays) + "d (+" + to_string(c.agingBoost) + ")")
                 << "\n";
        };

        cout << "\n[QUEUE 0 - CRITICAL TIER (Score >= 85) | PREEMPTIVE DISPATCH]:\n";
        printHeader();
        if (queue0.empty()) cout << "  (Queue is currently empty)\n";
        for (const auto& c : queue0) printRow(c);

        cout << "\n[QUEUE 1 - HIGH PRIORITY TIER (70 <= Score < 85) | 48H SLA]:\n";
        printHeader();
        if (queue1.empty()) cout << "  (Queue is currently empty)\n";
        for (const auto& c : queue1) printRow(c);

        cout << "\n[QUEUE 2 - NORMAL TIER (Score < 70) | AGING APPLIED]:\n";
        printHeader();
        if (queue2.empty()) cout << "  (Queue is currently empty)\n";
        for (const auto& c : queue2) printRow(c);

        cout << "\n[ACTIVELY RUNNING / IN PROGRESS (" << runningList.size() << ")]: \n";
        printHeader();
        if (runningList.empty()) cout << "  (No field teams actively running)\n";
        for (const auto& c : runningList) printRow(c);

        cout << "\n[WAITING / BLOCKED (" << waitingList.size() << ")]: \n";
        printHeader();
        if (waitingList.empty()) cout << "  (No complaints currently waiting on resources)\n";
        for (const auto& c : waitingList) printRow(c);

        cout << "\n[TERMINATED / RESOLVED (" << terminatedList.size() << ")]: \n";
        printHeader();
        if (terminatedList.empty()) cout << "  (No complaints resolved yet)\n";
        for (const auto& c : terminatedList) printRow(c);

        cout << string(85, '=') << "\n";
    }

    // ------------------------------------------------------------------------
    // JSON EXPORT: For Web Frontend / DBMS Bridge
    // ------------------------------------------------------------------------
    void exportToJSON(const string& filename) const {
        ofstream out(filename);
        if (!out.is_open()) {
            cerr << "Error: Could not open " << filename << " for writing.\n";
            return;
        }

        vector<ComplaintPCB> all;
        all.insert(all.end(), queue0.begin(), queue0.end());
        all.insert(all.end(), queue1.begin(), queue1.end());
        all.insert(all.end(), queue2.begin(), queue2.end());
        all.insert(all.end(), runningList.begin(), runningList.end());
        all.insert(all.end(), waitingList.begin(), waitingList.end());
        all.insert(all.end(), terminatedList.begin(), terminatedList.end());

        out << "[\n";
        for (size_t i = 0; i < all.size(); ++i) {
            const auto& c = all[i];
            out << "  {\n";
            out << "    \"id\": \"" << c.id << "\",\n";
            out << "    \"title\": \"" << c.title << "\",\n";
            out << "    \"category\": \"" << c.category << "\",\n";
            out << "    \"location\": \"" << c.location << "\",\n";
            out << "    \"ward\": \"" << c.ward << "\",\n";
            out << "    \"department\": \"" << c.department << "\",\n";
            out << "    \"priorityScore\": " << c.priorityScore << ",\n";
            out << "    \"queueLevel\": " << c.queueLevel << ",\n";
            out << "    \"duplicateCount\": " << c.duplicateCount << ",\n";
            out << "    \"waitingDays\": " << c.waitingDays << ",\n";
            out << "    \"agingBoost\": " << c.agingBoost << ",\n";
            out << "    \"status\": \"" << stateToString(c.state) << "\",\n";
            out << "    \"historyCount\": " << c.history.size() << "\n";
            out << "  }" << (i + 1 < all.size() ? "," : "") << "\n";
        }
        out << "]\n";
        out.close();
        cout << "[JSON EXPORTER] Exported " << all.size() << " records to " << filename << "\n";
    }

    // Getter for statistics
    void printStats() const {
        int readyCount = queue0.size() + queue1.size() + queue2.size();
        cout << "\n[OS METRICS SUMMARY]\n";
        cout << "  - Ready in Multilevel Queue: " << readyCount << "\n";
        cout << "    * Queue 0 (Critical): " << queue0.size() << "\n";
        cout << "    * Queue 1 (High):     " << queue1.size() << "\n";
        cout << "    * Queue 2 (Normal):   " << queue2.size() << "\n";
        cout << "  - Running in Field:          " << runningList.size() << "\n";
        cout << "  - Waiting (Blocked on I/O):  " << waitingList.size() << "\n";
        cout << "  - Terminated (Resolved):     " << terminatedList.size() << "\n";
    }
};

// ----------------------------------------------------------------------------
// SEED INITIAL COMPLAINTS (Matches the Frontend DB)
// ----------------------------------------------------------------------------
void seedInitialData(CivicScheduler& scheduler) {
    scheduler.addComplaint(ComplaintPCB("CS1024", "Large pothole near Sector 15 market", "Roads", "Sector 15 Market", "Central Zone", "Road Maintenance", 65, 12, 4));
    scheduler.addComplaint(ComplaintPCB("CS1031", "Drinking water pipeline burst", "Water", "MG Road, Pillar 142", "North Zone", "Water & Sewerage", 70, 7, 3));
    scheduler.addComplaint(ComplaintPCB("CS1009", "Garbage dump overflowing outside park", "Waste", "Green Park Enclave", "South Zone", "Solid Waste", 55, 15, 0));
    scheduler.addComplaint(ComplaintPCB("CS1045", "Street light pole sparking in lane", "Lighting", "Subhash Nagar Lane 4", "West Zone", "Electrical Wing", 50, 4, 1));
    scheduler.addComplaint(ComplaintPCB("CS1052", "Clogged storm drain flooding walkway", "Drainage", "School Road, Sector 8", "Central Zone", "Drainage Division", 45, 3, 5));
    scheduler.addComplaint(ComplaintPCB("CS1060", "Fallen tree branch on power transformer", "Electricity", "Block C Park", "East Zone", "Electrical Wing", 80, 8, 1));
}

// ----------------------------------------------------------------------------
// MAIN FUNCTION & INTERACTIVE SIMULATION MENU
// ----------------------------------------------------------------------------
int main() {
    CivicScheduler scheduler;
    seedInitialData(scheduler);

    int choice = 0;
    while (choice != 9) {
        cout << "\n" << string(60, '=') << "\n";
        cout << "      CIVIC SMART - OS BACKEND SIMULATION CONSOLE\n";
        cout << "  Team: City Solvers | Module: OS Scheduling Engine\n";
        cout << string(60, '=') << "\n";
        cout << " 1. Display Multilevel Queues (MLQ Status)\n";
        cout << " 2. Dispatch Next Highest Priority Task (RUNNING)\n";
        cout << " 3. Simulate Aging (24-Hour Time Step & Priority Boost)\n";
        cout << " 4. Add Duplicate Report (Simulate Duplicate Clustering)\n";
        cout << " 5. Register New Citizen Complaint (NEW -> READY)\n";
        cout << " 6. Block Complaint on Resource (RUNNING -> WAITING)\n";
        cout << " 7. Resolve / Terminate Complaint (RUNNING -> TERMINATED)\n";
        cout << " 8. Export Queues to JSON (For Web Frontend Sync)\n";
        cout << " 9. Exit\n";
        cout << " Enter choice [1-9]: ";

        if (!(cin >> choice)) {
            cin.clear();
            cin.ignore(10000, '\n');
            continue;
        }

        switch (choice) {
            case 1: {
                scheduler.printQueueStatus();
                scheduler.printStats();
                break;
            }
            case 2: {
                scheduler.dispatchNext();
                break;
            }
            case 3: {
                scheduler.simulateAgingDay();
                scheduler.printQueueStatus();
                break;
            }
            case 4: {
                string id;
                cout << "Enter Complaint ID to add duplicate report for (e.g. CS1052): ";
                cin >> id;
                scheduler.addDuplicateReport(id);
                break;
            }
            case 5: {
                string id, title, cat, loc, dept;
                int sev;
                cout << "Enter Complaint ID (e.g., CS1099): "; cin >> id;
                cin.ignore();
                cout << "Enter Title: "; getline(cin, title);
                cout << "Enter Category (Roads/Water/Waste/Lighting/Drainage): "; getline(cin, cat);
                cout << "Enter Location: "; getline(cin, loc);
                cout << "Enter Department: "; getline(cin, dept);
                cout << "Enter Base Severity [40:Low, 60:Med, 75:High, 90:Critical]: "; cin >> sev;
                scheduler.addComplaint(ComplaintPCB(id, title, cat, loc, "Zone 1", dept, sev, 1, 0));
                cout << "\n[SUCCESS] Complaint #" << id << " added to Ready Queue.\n";
                break;
            }
            case 6: {
                string id, reason;
                cout << "Enter Complaint ID to block (must be currently RUNNING): "; cin >> id;
                cin.ignore();
                cout << "Enter reason (e.g., Awaiting asphalt supply): "; getline(cin, reason);
                scheduler.blockComplaint(id, reason);
                break;
            }
            case 7: {
                string id, note;
                cout << "Enter Complaint ID to resolve: "; cin >> id;
                cin.ignore();
                cout << "Enter resolution audit note: "; getline(cin, note);
                scheduler.resolveComplaint(id, note);
                break;
            }
            case 8: {
                string filename = "scheduled_complaints.json";
                scheduler.exportToJSON(filename);
                break;
            }
            case 9: {
                cout << "\nExiting Civic Smart OS Scheduling Engine. Goodbye!\n";
                break;
            }
            default: {
                cout << "Invalid choice. Please select between 1 and 9.\n";
                break;
            }
        }
    }

    return 0;
}
