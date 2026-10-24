/**
 * ============================================================================
 * CIVIC SMART - OS SCHEDULING ENGINE (C++ Backend)
 * Project Code: OSDBMS-V-2026-T227
 * Team: City Solvers | Module: OS / Scheduling Logic
 * ============================================================================
 *
 * The engine now supports two modes:
 *   1. Interactive console simulation for the OS project demonstration.
 *   2. Batch JSON scheduling mode for Flask/PostgreSQL integration:
 *        civic_os_engine.exe --schedule-json
 *
 * Scheduling policy:
 *   Priority = min(99, base severity + duplicate boost + ready aging boost
 *                      + SLA deadline urgency)
 *
 * Tie-breaking is deterministic:
 *   priority desc, severity desc, earlier SLA deadline, longer ready wait,
 *   earlier creation time, complaint id asc.
 * ============================================================================
 */

#include <algorithm>
#include <cctype>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace std;

enum class ProcessState {
    NEW,
    READY,
    RUNNING,
    WAITING,
    TERMINATED
};

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

string jsonEscape(const string& value) {
    ostringstream out;
    for (char ch : value) {
        switch (ch) {
            case '"':  out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (static_cast<unsigned char>(ch) < 0x20) {
                    out << "\\u" << hex << setw(4) << setfill('0') << static_cast<int>(ch);
                } else {
                    out << ch;
                }
        }
    }
    return out.str();
}

string nowTimestamp() {
    time_t now = time(0);
    char buf[80];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", localtime(&now));
    return string(buf);
}

time_t parseIsoTime(const string& text) {
    if (text.empty()) return 0;

    tm value = {};
    int year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
    int matched = sscanf(text.c_str(), "%d-%d-%dT%d:%d:%d", &year, &month, &day, &hour, &minute, &second);
    if (matched < 3) {
        matched = sscanf(text.c_str(), "%d-%d-%d %d:%d:%d", &year, &month, &day, &hour, &minute, &second);
    }
    if (matched < 3) return 0;

    value.tm_year = year - 1900;
    value.tm_mon = month - 1;
    value.tm_mday = day;
    value.tm_hour = hour;
    value.tm_min = minute;
    value.tm_sec = second;
    value.tm_isdst = -1;
    return mktime(&value);
}

struct StatusHistoryEntry {
    string fromState;
    string toState;
    string timestamp;
    string remarks;
};

struct ComplaintPCB {
    string id;
    string title;
    string category;
    string location;
    string ward;
    string department;
    string createdAt;
    string slaDeadline;
    string selectionReason;

    int baseSeverity;
    int duplicateCount;
    int duplicateBoost;
    int totalAgeDays;
    int readyWaitDays;
    int blockedDays;
    int agingRate;
    int agingBoost;
    int deadlineUrgencyBoost;
    int priorityScore;
    int queueLevel;
    ProcessState state;

    vector<StatusHistoryEntry> history;

    ComplaintPCB(string _id = "", string _title = "", string _category = "",
                 string _location = "", string _ward = "", string _dept = "",
                 int _baseSev = 60, int _duplicates = 1, int _readyDays = 0,
                 string _createdAt = "", string _deadline = "",
                 ProcessState _state = ProcessState::NEW)
        : id(_id), title(_title), category(_category), location(_location),
          ward(_ward), department(_dept), createdAt(_createdAt), slaDeadline(_deadline),
          baseSeverity(_baseSev), duplicateCount(_duplicates), duplicateBoost(0),
          totalAgeDays(_readyDays), readyWaitDays(_readyDays), blockedDays(0),
          agingRate(2), agingBoost(0), deadlineUrgencyBoost(0), priorityScore(0),
          queueLevel(2), state(_state) {
        calculatePriority();
        logTransition("NONE", stateToString(state), "Complaint initialized in PCB table.");
    }

    void calculatePriority(time_t referenceTime = time(0)) {
        duplicateBoost = min(20, max(0, duplicateCount - 1) * 2);
        agingBoost = max(0, readyWaitDays) * agingRate;
        deadlineUrgencyBoost = 0;

        time_t due = parseIsoTime(slaDeadline);
        if (due > 0) {
            double hoursRemaining = difftime(due, referenceTime) / 3600.0;
            if (hoursRemaining <= 0) deadlineUrgencyBoost = 20;
            else if (hoursRemaining <= 24) deadlineUrgencyBoost = 15;
            else if (hoursRemaining <= 48) deadlineUrgencyBoost = 10;
            else if (hoursRemaining <= 72) deadlineUrgencyBoost = 5;
        }

        priorityScore = min(99, baseSeverity + duplicateBoost + agingBoost + deadlineUrgencyBoost);

        if (priorityScore >= 85) queueLevel = 0;
        else if (priorityScore >= 70) queueLevel = 1;
        else queueLevel = 2;
    }

    void logTransition(string from, string to, string remark) {
        history.push_back({from, to, nowTimestamp(), remark});
    }

    void setState(ProcessState newState, string remarks = "") {
        string oldStr = stateToString(state);
        state = newState;
        logTransition(oldStr, stateToString(newState), remarks);
    }

    void ageOneDay() {
        if (state == ProcessState::TERMINATED) return;
        totalAgeDays++;
        if (state == ProcessState::READY) readyWaitDays++;
        if (state == ProcessState::WAITING) blockedDays++;
        calculatePriority();
    }
};

bool schedulerComesBefore(const ComplaintPCB& a, const ComplaintPCB& b) {
    if (a.priorityScore != b.priorityScore) return a.priorityScore > b.priorityScore;
    if (a.baseSeverity != b.baseSeverity) return a.baseSeverity > b.baseSeverity;

    time_t aDue = parseIsoTime(a.slaDeadline);
    time_t bDue = parseIsoTime(b.slaDeadline);
    if (aDue != bDue) {
        if (aDue == 0) return false;
        if (bDue == 0) return true;
        return aDue < bDue;
    }

    if (a.readyWaitDays != b.readyWaitDays) return a.readyWaitDays > b.readyWaitDays;

    time_t aCreated = parseIsoTime(a.createdAt);
    time_t bCreated = parseIsoTime(b.createdAt);
    if (aCreated != bCreated) {
        if (aCreated == 0) return false;
        if (bCreated == 0) return true;
        return aCreated < bCreated;
    }

    return a.id < b.id;
}

class CivicScheduler {
private:
    vector<ComplaintPCB> queue0;
    vector<ComplaintPCB> queue1;
    vector<ComplaintPCB> queue2;
    vector<ComplaintPCB> runningList;
    vector<ComplaintPCB> waitingList;
    vector<ComplaintPCB> terminatedList;

public:
    void addComplaint(ComplaintPCB pcb) {
        if (pcb.state == ProcessState::NEW) {
            pcb.setState(ProcessState::READY, "Placed into Ready Queue.");
        }
        insertIntoQueue(pcb);
    }

    void insertIntoQueue(const ComplaintPCB& pcb) {
        if (pcb.state == ProcessState::WAITING) {
            waitingList.push_back(pcb);
            return;
        }
        if (pcb.state == ProcessState::RUNNING) {
            runningList.push_back(pcb);
            return;
        }
        if (pcb.state == ProcessState::TERMINATED) {
            terminatedList.push_back(pcb);
            return;
        }

        if (pcb.queueLevel == 0) queue0.push_back(pcb);
        else if (pcb.queueLevel == 1) queue1.push_back(pcb);
        else queue2.push_back(pcb);
        resortAllQueues();
    }

    void resortAllQueues() {
        sort(queue0.begin(), queue0.end(), schedulerComesBefore);
        sort(queue1.begin(), queue1.end(), schedulerComesBefore);
        sort(queue2.begin(), queue2.end(), schedulerComesBefore);
    }

    void simulateAgingDay() {
        cout << "\n>>> [OS SCHEDULER] Simulating 24 Hours Passage (Aging Applied)... <<<\n";
        vector<ComplaintPCB> ready;
        ready.insert(ready.end(), queue0.begin(), queue0.end());
        ready.insert(ready.end(), queue1.begin(), queue1.end());
        ready.insert(ready.end(), queue2.begin(), queue2.end());

        queue0.clear();
        queue1.clear();
        queue2.clear();

        for (auto& c : ready) {
            c.ageOneDay();
            insertIntoQueue(c);
        }
        for (auto& c : waitingList) c.ageOneDay();
    }

    bool selectNext(ComplaintPCB& selected) {
        vector<ComplaintPCB>* queues[] = {&queue0, &queue1, &queue2};
        int bestQueue = -1;
        size_t bestIndex = 0;

        for (int i = 0; i < 3; ++i) {
            for (size_t j = 0; j < queues[i]->size(); ++j) {
                if (bestQueue < 0 || schedulerComesBefore((*queues[i])[j], (*queues[bestQueue])[bestIndex])) {
                    bestQueue = i;
                    bestIndex = j;
                }
            }
        }

        if (bestQueue < 0) return false;

        selected = (*queues[bestQueue])[bestIndex];
        selected.selectionReason =
            "Selected by priority policy: score=" + to_string(selected.priorityScore) +
            ", severity=" + to_string(selected.baseSeverity) +
            ", duplicateBoost=" + to_string(selected.duplicateBoost) +
            ", readyAgingBoost=" + to_string(selected.agingBoost) +
            ", deadlineBoost=" + to_string(selected.deadlineUrgencyBoost) +
            ", queue=" + to_string(selected.queueLevel) + ".";
        queues[bestQueue]->erase(queues[bestQueue]->begin() + bestIndex);
        return true;
    }

    bool dispatchNext() {
        ComplaintPCB dispatched;
        if (!selectNext(dispatched)) {
            cout << "No pending complaints ready for dispatch.\n";
            return false;
        }

        dispatched.setState(ProcessState::RUNNING, "Dispatched to Municipal Field Team.");
        runningList.push_back(dispatched);
        cout << "\n[DISPATCHER] Dispatched Complaint #" << dispatched.id
             << " (\"" << dispatched.title << "\") from Queue " << dispatched.queueLevel
             << " | Priority Score: " << dispatched.priorityScore
             << " -> State: RUNNING\n";
        return true;
    }

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

    bool resolveComplaint(string complaintId, string auditNote = "Field verification completed.") {
        auto resolveFrom = [&](vector<ComplaintPCB>& list) {
            for (auto it = list.begin(); it != list.end(); ++it) {
                if (it->id == complaintId) {
                    ComplaintPCB p = *it;
                    list.erase(it);
                    p.setState(ProcessState::TERMINATED, auditNote);
                    terminatedList.push_back(p);
                    cout << "\n[RESOLUTION AUDIT] Complaint #" << p.id << " marked TERMINATED / RESOLVED.\n";
                    return true;
                }
            }
            return false;
        };

        if (resolveFrom(runningList) || resolveFrom(waitingList)) return true;
        cout << "Complaint #" << complaintId << " not found in RUNNING or WAITING lists.\n";
        return false;
    }

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
            vector<ComplaintPCB> ready;
            ready.insert(ready.end(), queue0.begin(), queue0.end());
            ready.insert(ready.end(), queue1.begin(), queue1.end());
            ready.insert(ready.end(), queue2.begin(), queue2.end());
            queue0.clear();
            queue1.clear();
            queue2.clear();
            for (auto& c : ready) insertIntoQueue(c);
            return true;
        }
        cout << "Complaint #" << complaintId << " not found.\n";
        return false;
    }

    void printQueueStatus() const {
        cout << "\n" << string(96, '=') << "\n";
        cout << "              CIVIC SMART - MULTILEVEL QUEUE STATUS (OS SCHEDULER)\n";
        cout << string(96, '=') << "\n";

        auto printHeader = []() {
            cout << left << setw(10) << "ID"
                 << setw(26) << "Title"
                 << setw(16) << "Category"
                 << setw(8)  << "Score"
                 << setw(8)  << "Queue"
                 << setw(16) << "Ready/Blocked"
                 << "\n";
            cout << string(96, '-') << "\n";
        };

        auto printRow = [](const ComplaintPCB& c) {
            string shortTitle = c.title.length() > 24 ? c.title.substr(0, 21) + "..." : c.title;
            cout << left << setw(10) << ("#" + c.id)
                 << setw(26) << shortTitle
                 << setw(16) << c.category
                 << setw(8)  << c.priorityScore
                 << setw(8)  << c.queueLevel
                 << setw(16) << (to_string(c.readyWaitDays) + "d / " + to_string(c.blockedDays) + "d")
                 << "\n";
        };

        auto printQueue = [&](const string& label, const vector<ComplaintPCB>& q) {
            cout << "\n[" << label << "]:\n";
            printHeader();
            if (q.empty()) cout << "  (Queue is currently empty)\n";
            for (const auto& c : q) printRow(c);
        };

        printQueue("QUEUE 0 - CRITICAL TIER (Score >= 85)", queue0);
        printQueue("QUEUE 1 - HIGH PRIORITY TIER (70 <= Score < 85)", queue1);
        printQueue("QUEUE 2 - NORMAL TIER (Score < 70)", queue2);
        printQueue("ACTIVELY RUNNING / IN PROGRESS", runningList);
        printQueue("WAITING / BLOCKED", waitingList);
        printQueue("TERMINATED / RESOLVED", terminatedList);
        cout << string(96, '=') << "\n";
    }

    void printStats() const {
        int readyCount = static_cast<int>(queue0.size() + queue1.size() + queue2.size());
        cout << "\n[OS METRICS SUMMARY]\n";
        cout << "  - Ready in Multilevel Queue: " << readyCount << "\n";
        cout << "    * Queue 0 (Critical): " << queue0.size() << "\n";
        cout << "    * Queue 1 (High):     " << queue1.size() << "\n";
        cout << "    * Queue 2 (Normal):   " << queue2.size() << "\n";
        cout << "  - Running in Field:          " << runningList.size() << "\n";
        cout << "  - Waiting (Blocked):         " << waitingList.size() << "\n";
        cout << "  - Terminated (Resolved):     " << terminatedList.size() << "\n";
    }
};

class JsonParser {
private:
    string text;
    size_t pos;

    void skipWhitespace() {
        while (pos < text.size() && isspace(static_cast<unsigned char>(text[pos]))) pos++;
    }

    char peek() {
        skipWhitespace();
        return pos < text.size() ? text[pos] : '\0';
    }

    void expect(char ch) {
        skipWhitespace();
        if (pos >= text.size() || text[pos] != ch) {
            throw runtime_error(string("Expected '") + ch + "' while parsing JSON.");
        }
        pos++;
    }

    string parseString() {
        expect('"');
        string value;
        while (pos < text.size()) {
            char ch = text[pos++];
            if (ch == '"') return value;
            if (ch == '\\') {
                if (pos >= text.size()) throw runtime_error("Invalid JSON escape.");
                char esc = text[pos++];
                switch (esc) {
                    case '"': value.push_back('"'); break;
                    case '\\': value.push_back('\\'); break;
                    case '/': value.push_back('/'); break;
                    case 'b': value.push_back('\b'); break;
                    case 'f': value.push_back('\f'); break;
                    case 'n': value.push_back('\n'); break;
                    case 'r': value.push_back('\r'); break;
                    case 't': value.push_back('\t'); break;
                    case 'u':
                        if (pos + 4 > text.size()) throw runtime_error("Invalid unicode escape.");
                        value += "?";
                        pos += 4;
                        break;
                    default:
                        throw runtime_error("Unsupported JSON escape.");
                }
            } else {
                value.push_back(ch);
            }
        }
        throw runtime_error("Unterminated JSON string.");
    }

    string parseLiteral() {
        skipWhitespace();
        size_t start = pos;
        while (pos < text.size()) {
            char ch = text[pos];
            if (ch == ',' || ch == '}' || ch == ']' || isspace(static_cast<unsigned char>(ch))) break;
            pos++;
        }
        return text.substr(start, pos - start);
    }

public:
    explicit JsonParser(string source) : text(source), pos(0) {}

    vector<map<string, string>> parseArrayOfObjects() {
        vector<map<string, string>> rows;
        expect('[');
        if (peek() == ']') {
            pos++;
            return rows;
        }

        while (true) {
            map<string, string> row;
            expect('{');
            if (peek() != '}') {
                while (true) {
                    string key = parseString();
                    expect(':');
                    string value = (peek() == '"') ? parseString() : parseLiteral();
                    row[key] = value;
                    if (peek() != ',') break;
                    pos++;
                }
            }
            expect('}');
            rows.push_back(row);
            if (peek() != ',') break;
            pos++;
        }
        expect(']');
        return rows;
    }
};

int intFromRow(const map<string, string>& row, const string& key, int fallback) {
    auto it = row.find(key);
    if (it == row.end() || it->second.empty() || it->second == "null") return fallback;
    try {
        return stoi(it->second);
    } catch (...) {
        return fallback;
    }
}

string stringFromRow(const map<string, string>& row, const string& key, const string& fallback = "") {
    auto it = row.find(key);
    if (it == row.end() || it->second == "null") return fallback;
    return it->second;
}

ProcessState stateFromStatus(const string& status, const string& processState) {
    string combined = status + " " + processState;
    transform(combined.begin(), combined.end(), combined.begin(), ::toupper);
    if (combined.find("BLOCK") != string::npos || combined.find("WAITING") != string::npos) return ProcessState::WAITING;
    if (combined.find("PROGRESS") != string::npos || combined.find("RUNNING") != string::npos) return ProcessState::RUNNING;
    if (combined.find("RESOLVED") != string::npos || combined.find("TERMINATED") != string::npos) return ProcessState::TERMINATED;
    return ProcessState::READY;
}

ComplaintPCB pcbFromRow(const map<string, string>& row) {
    string id = stringFromRow(row, "id", stringFromRow(row, "complaint_id"));
    int severityBase = intFromRow(row, "severityBase", intFromRow(row, "severity_base", 60));
    int duplicateCount = intFromRow(row, "duplicateCount", intFromRow(row, "duplicate_count", 1));
    int waitingDays = intFromRow(row, "readyWaitDays", intFromRow(row, "waitingDays", intFromRow(row, "waiting_days", 0)));
    string status = stringFromRow(row, "status", "Reported");
    string processState = stringFromRow(row, "processState", stringFromRow(row, "process_state"));
    ProcessState state = stateFromStatus(status, processState);

    ComplaintPCB pcb(
        id,
        stringFromRow(row, "title"),
        stringFromRow(row, "category"),
        stringFromRow(row, "location"),
        stringFromRow(row, "ward"),
        stringFromRow(row, "department"),
        severityBase,
        duplicateCount,
        waitingDays,
        stringFromRow(row, "createdAt", stringFromRow(row, "created_at")),
        stringFromRow(row, "slaDeadline", stringFromRow(row, "deadline")),
        state
    );
    pcb.totalAgeDays = intFromRow(row, "totalAgeDays", waitingDays);
    pcb.readyWaitDays = waitingDays;
    pcb.blockedDays = intFromRow(row, "blockedDays", 0);
    pcb.calculatePriority();
    return pcb;
}

string selectedToJson(const ComplaintPCB& c) {
    ostringstream out;
    out << "{";
    out << "\"id\":\"" << jsonEscape(c.id) << "\",";
    out << "\"title\":\"" << jsonEscape(c.title) << "\",";
    out << "\"category\":\"" << jsonEscape(c.category) << "\",";
    out << "\"department\":\"" << jsonEscape(c.department) << "\",";
    out << "\"priorityScore\":" << c.priorityScore << ",";
    out << "\"queueLevel\":" << c.queueLevel << ",";
    out << "\"baseSeverity\":" << c.baseSeverity << ",";
    out << "\"duplicateBoost\":" << c.duplicateBoost << ",";
    out << "\"readyWaitDays\":" << c.readyWaitDays << ",";
    out << "\"agingBoost\":" << c.agingBoost << ",";
    out << "\"deadlineUrgencyBoost\":" << c.deadlineUrgencyBoost << ",";
    out << "\"slaDeadline\":\"" << jsonEscape(c.slaDeadline) << "\",";
    out << "\"reason\":\"" << jsonEscape(c.selectionReason) << "\"";
    out << "}";
    return out.str();
}

int runJsonScheduler() {
    try {
        string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
        JsonParser parser(input);
        vector<map<string, string>> rows = parser.parseArrayOfObjects();

        CivicScheduler scheduler;
        int eligibleCount = 0;
        for (const auto& row : rows) {
            ComplaintPCB pcb = pcbFromRow(row);
            if (pcb.state == ProcessState::READY || pcb.state == ProcessState::NEW) {
                scheduler.addComplaint(pcb);
                eligibleCount++;
            }
        }

        ComplaintPCB selected;
        bool found = scheduler.selectNext(selected);

        cout << "{";
        cout << "\"ok\":true,";
        cout << "\"eligibleCount\":" << eligibleCount << ",";
        cout << "\"policy\":\"severity + capped duplicate boost + ready aging + SLA urgency; deterministic tie-breakers\",";
        cout << "\"selected\":" << (found ? selectedToJson(selected) : "null");
        cout << "}\n";
        return 0;
    } catch (const exception& ex) {
        cout << "{\"ok\":false,\"error\":\"" << jsonEscape(ex.what()) << "\"}\n";
        return 1;
    }
}

void seedInitialData(CivicScheduler& scheduler) {
    scheduler.addComplaint(ComplaintPCB("CS1024", "Large pothole near Sector 15 market", "Roads", "Sector 15 Market", "Central Zone", "Road Maintenance", 65, 12, 4));
    scheduler.addComplaint(ComplaintPCB("CS1031", "Drinking water pipeline burst", "Water", "MG Road, Pillar 142", "North Zone", "Water & Sewerage", 70, 7, 3));
    scheduler.addComplaint(ComplaintPCB("CS1009", "Garbage dump overflowing outside park", "Waste", "Green Park Enclave", "South Zone", "Solid Waste", 55, 15, 0));
    scheduler.addComplaint(ComplaintPCB("CS1045", "Street light pole sparking in lane", "Lighting", "Subhash Nagar Lane 4", "West Zone", "Electrical Wing", 50, 4, 1));
    scheduler.addComplaint(ComplaintPCB("CS1052", "Clogged storm drain flooding walkway", "Drainage", "School Road, Sector 8", "Central Zone", "Drainage Division", 45, 3, 5));
    scheduler.addComplaint(ComplaintPCB("CS1060", "Fallen tree branch on power transformer", "Electricity", "Block C Park", "East Zone", "Electrical Wing", 80, 8, 1));
}

int runInteractiveConsole() {
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
        cout << " 9. Exit\n";
        cout << " Enter choice [1-9]: ";

        if (!(cin >> choice)) {
            cin.clear();
            cin.ignore(10000, '\n');
            continue;
        }

        switch (choice) {
            case 1:
                scheduler.printQueueStatus();
                scheduler.printStats();
                break;
            case 2:
                scheduler.dispatchNext();
                break;
            case 3:
                scheduler.simulateAgingDay();
                scheduler.printQueueStatus();
                break;
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
            case 9:
                cout << "\nExiting Civic Smart OS Scheduling Engine. Goodbye!\n";
                break;
            default:
                cout << "Invalid choice. Please select between 1 and 9.\n";
                break;
        }
    }

    return 0;
}

int main(int argc, char* argv[]) {
    if (argc > 1 && string(argv[1]) == "--schedule-json") {
        return runJsonScheduler();
    }
    return runInteractiveConsole();
}
