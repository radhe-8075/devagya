
const knowledgeBase = {
  assistant: {
    name: "Devagya",
    role: "University Student Assistance Chatbot",
    purpose:
      "I help students find demo information about faculty, subjects, fees, rooms, exams, question papers, campus services, hostels, certificates, documents and scholarships.",
    createdBy: "The developer of this student-assistance demo project",
    languages: ["English", "Hindi", "Hinglish"]
  },

  faculties: [
    {
      id: "F001",
      name: "Dr. Aarav Sharma",
      department: "CSE",
      course: "B.Tech",
      designation: "HOD",
      subjects: ["Data Structures"],
      room: "3001",
      block: "Academic Block A",
      floor: "3rd Floor"
    },
    {
      id: "F002",
      name: "Dr. Aarav Sharma",
      department: "MBA",
      course: "MBA",
      designation: "Professor",
      subjects: ["Marketing Management"],
      room: "210",
      block: "Management Block M",
      floor: "2nd Floor"
    },
    {
      id: "F003",
      name: "Dr. Aarav Sharma",
      department: "ECE",
      course: "B.Tech",
      designation: "Assistant Professor",
      subjects: ["Digital Electronics"],
      room: "118",
      block: "Academic Block B",
      floor: "1st Floor"
    },
    {
      id: "F004",
      name: "Dr. Neha Verma",
      department: "CSE",
      course: "B.Tech",
      designation: "Assistant Professor",
      subjects: ["Data Structures"],
      room: "302",
      block: "Academic Block A",
      floor: "3rd Floor"
    },
    {
      id: "F005",
      name: "Prof. Neha Verma",
      department: "MBA",
      course: "MBA",
      designation: "HOD",
      subjects: ["Marketing Management"],
      room: "205",
      block: "Management Block M",
      floor: "2nd Floor"
    },
    {
      id: "F006",
      name: "Mr. Rahul Singh",
      department: "CSE",
      course: "B.Tech",
      designation: "Assistant Professor",
      subjects: ["Data Structures"],
      room: "304",
      block: "Academic Block A",
      floor: "3rd Floor"
    },
    {
      id: "F007",
      name: "Demo English Faculty",
      department: "English",
      course: "B.Tech",
      designation: "Assistant Professor",
      subjects: ["English", "Communication Skills"],
      room: "To be confirmed",
      block: "To be confirmed",
      floor: "To be confirmed"
    },
    {
      id: "F008",
      name: "Demo Mathematics Faculty",
      department: "Mathematics",
      course: "B.Tech",
      designation: "Assistant Professor",
      subjects: ["Mathematics", "Engineering Mathematics"],
      room: "To be confirmed",
      block: "To be confirmed",
      floor: "To be confirmed"
    }
  ],

  rooms: [
    {
      room: "3001",
      block: "Academic Block A",
      floor: "3rd Floor",
      purpose: "CSE HOD Office"
    },
    {
      room: "302",
      block: "Academic Block A",
      floor: "3rd Floor",
      purpose: "CSE Faculty Cabin"
    },
    {
      room: "304",
      block: "Academic Block A",
      floor: "3rd Floor",
      purpose: "CSE Faculty Cabin"
    },
    {
      room: "118",
      block: "Academic Block B",
      floor: "1st Floor",
      purpose: "ECE Faculty Cabin"
    },
    {
      room: "210",
      block: "Management Block M",
      floor: "2nd Floor",
      purpose: "MBA Faculty Office"
    },
    {
      room: "205",
      block: "Management Block M",
      floor: "2nd Floor",
      purpose: "MBA HOD Office"
    }
  ],

  fees: [
    {
      course: "B.Tech",
      branch: "CSE",
      feeType: "tuition",
      period: "semester",
      amount: 75000,
      academicYear: "2026-2027"
    },
    {
      course: "B.Tech",
      branch: "ECE",
      feeType: "tuition",
      period: "semester",
      amount: 72000,
      academicYear: "2026-2027"
    },
    {
      course: "MBA",
      branch: "MBA",
      feeType: "tuition",
      period: "semester",
      amount: 90000,
      academicYear: "2026-2027"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      feeType: "hostel",
      period: "year",
      amount: 85000,
      academicYear: "2026-2027"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      feeType: "transport",
      period: "year",
      amount: 24000,
      academicYear: "2026-2027"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      feeType: "exam",
      period: "semester",
      amount: 2500,
      academicYear: "2026-2027"
    }
  ],

  exams: [
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      examType: "Mid-Semester",
      date: "2026-11-15",
      time: "10:00 AM",
      venue: "Academic Block A"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      examType: "End-Semester",
      date: "2026-12-10",
      time: "09:00 AM",
      venue: "Exam Hall 2"
    },
    {
      course: "MBA",
      branch: "MBA",
      semester: 1,
      subject: "Marketing Management",
      examType: "Mid-Semester",
      date: "2026-11-18",
      time: "11:00 AM",
      venue: "Management Block M"
    }
  ],

  papers: [
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      year: 2026,
      file: "btech-cse-sem3-data-structures-2026.pdf"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      year: 2025,
      file: "btech-cse-sem3-data-structures-2025.pdf"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      year: 2024,
      file: "btech-cse-sem3-data-structures-2024.pdf"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      year: 2023,
      file: "btech-cse-sem3-data-structures-2023.pdf"
    },
    {
      course: "B.Tech",
      branch: "CSE",
      semester: 3,
      subject: "Data Structures",
      year: 2022,
      file: "btech-cse-sem3-data-structures-2022.pdf"
    },
    {
      course: "MBA",
      branch: "MBA",
      semester: 1,
      subject: "Marketing Management",
      year: 2025,
      file: "mba-sem1-marketing-management-2025.pdf"
    }
  ],

  campus: [
    {
      name: "Central Library",
      category: "library",
      block: "Library Block L",
      floor: "Ground Floor"
    },
    {
      name: "Cafe GD",
      category: "cafe cafeteria food",
      block: "Location to be confirmed",
      floor: "Not confirmed"
    },
    {
      name: "Subway",
      category: "restaurant food cafeteria",
      block: "Location to be confirmed",
      floor: "Not confirmed"
    },
    {
      name: "Accounts Office",
      category: "accounts",
      block: "Administrative Block D",
      room: "101"
    },
    {
      name: "Admissions Office",
      category: "admissions",
      block: "Administrative Block D",
      room: "102"
    },
    {
      name: "Hostel Warden Office",
      category: "hostel",
      block: "Hostel Block H",
      room: "101"
    },
    {
      name: "Student Services Desk",
      category: "student services",
      block: "Administrative Block D",
      room: "120"
    }
  ],

  academics: [
    {
      type: "attendance",
      course: "B.Tech",
      details: "Demo rule: minimum 75% attendance."
    },
    {
      type: "scholarship",
      course: "B.Tech",
      details: "Demo scheme: 10% tuition discount for eligible students."
    },
    {
      type: "timetable",
      course: "B.Tech",
      details: "Demo schedule: weekdays, 9:00 AM to 4:00 PM."
    }
  ],

  // Hostel directory — fictional demo records
  hostels: [
    {
      name: "Girls Hostel 1",
      type: "Girls",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Girls Hostel 2",
      type: "Girls",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Boys Hostel 1",
      type: "Boys",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Boys Hostel 2",
      type: "Boys",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Boys Hostel 3",
      type: "Boys",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Boys Hostel 4",
      type: "Boys",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Boys Hostel 5",
      type: "Boys",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    },
    {
      name: "Boys Hostel 6",
      type: "Boys",
      block: "Block to be confirmed",
      location: "Location to be confirmed"
    }
  ]
};

module.exports = knowledgeBase;
