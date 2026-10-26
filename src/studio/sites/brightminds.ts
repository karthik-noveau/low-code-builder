/** Bright Minds: a tuition centre with admissions by seats and a fee record. */
import { catalog } from "../../apps/templates/catalog";
import { classesApp, formNamed } from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function brightMinds(brand: string): SiteParts {
  const ui = styled("#eef2fd", "#1d2f6f");
  const admit = "/admissions";
  const courses = catalog({
    name: "Courses",
    singular: "Course",
    blueprint: "custom",
    fields: [
      ["Course", "text"],
      ["Monthly fee", "price"],
      ["Seats", "number"],
      ["Timings", "text"],
      ["Description", "longText"],
      ["Admission link", "link"],
    ],
    display: {
      title: "Course",
      price: "Monthly fee",
      subtitle: "Timings",
      summary: "Description",
      body: "Description",
      action: "Admission link",
      actionLabel: "Ask for admission",
    },
    rows: [
      [
        "Class 6–8 Maths and Science",
        "2200",
        "25",
        "Mon, Wed, Fri · 4:30–6 pm",
        "Concepts first, then practice. Weekly worksheets and a monthly test with a parent report.",
        admit,
      ],
      [
        "Class 9–10 Board preparation",
        "3200",
        "20",
        "Mon to Fri · 6–8 pm",
        "Maths, Science and English for CBSE and State boards, with full-length mock exams from December.",
        admit,
      ],
      [
        "Class 11–12 Physics, Chemistry, Maths",
        "4500",
        "18",
        "Mon to Sat · 6–8:30 pm",
        "Board syllabus with entrance-level problem solving. Doubt sessions every Saturday.",
        admit,
      ],
      [
        "JEE and NEET foundation",
        "3800",
        "15",
        "Sat and Sun · 9 am–1 pm",
        "For Class 9 and 10 students starting early: logic, speed and strong basics.",
        admit,
      ],
      [
        "Spoken English and confidence",
        "1800",
        "15",
        "Tue and Thu · 5–6 pm",
        "Speaking, reading aloud, debates and presentations for ages 10 to 16.",
        admit,
      ],
      [
        "Coding for kids",
        "2000",
        "12",
        "Sat · 3–5 pm",
        "Scratch and Python projects: games, animations and a showcase at the end of term.",
        admit,
      ],
    ],
  });
  const app = classesApp(brand, { courses }).app;
  const { header, footer } = chrome(brand, {
    announcement: "Admissions open for the new batch · Free trial class →",
    announcementUrl: admit,
    cta: ["Ask for admission", admit],
    tagline:
      "Tuition for Class 6–12, entrance foundation, English and coding · 3rd floor, Sai Plaza, Anna Nagar, Chennai",
    dark: "#1d2f6f",
  });
  const pages = [
    page(
      "Home",
      "",
      "Bright Minds tuition in Anna Nagar: Maths, Science and board preparation for Class 6–12, JEE foundation, English and coding.",
      [
        createSection("hero", {
          title: "Small batches.\nBig results.",
          eyebrow: "TUITION FOR CLASS 6–12",
          body: "At most 25 students a batch, teachers who know every child by name and a monthly report you can actually read.",
          image: "/images/classroom.jpg",
          imageAlt: "A blackboard, books and a pencil",
          color: "#ffffff",
          buttonLabel: "Ask for admission",
          buttonUrl: admit,
          overlay: 40,
        }),
        ui.features([
          ["Seats are limited", "Batches close when they’re full."],
          ["A free trial class", "Sit in before you decide."],
          ["Fees online, anytime", "Parents check every payment by phone."],
        ]),
        listing(courses, {
          title: "Courses this term",
          eyebrow: "COURSES",
          style: "list",
          columns: 2,
          limit: 4,
        }),
        ui.story({
          eyebrow: "WHY PARENTS CHOOSE US",
          title: "92% scored above 85% in the last board exams.",
          body: "Our teachers have taught for an average of eleven years. Every student gets a weekly test, a doubt-clearing slot and a progress report each month.",
          image: "/images/classroom.jpg",
          imageAlt: "Books stacked on a desk",
          buttonLabel: "See all courses",
          buttonUrl: "/courses",
        }),
        ui.quotes("From students and parents.", [
          [
            "Karthik S., Class 12",
            "Went from 62 to 91 in Physics. The Saturday doubt sessions made the difference.",
          ],
          [
            "Mrs. Lakshmi N., parent",
            "The monthly report tells me exactly where my daughter needs help. Paying fees and checking them online is easy.",
          ],
          [
            "Aditi R., Class 10",
            "Small batches mean you can ask anything. I actually like maths now.",
          ],
        ]),
        ui.cta(
          "SEATS FILL BY JUNE",
          "Book a free trial class.",
          "Send an admission enquiry and we’ll call you within a day.",
          ["Ask for admission", admit],
        ),
      ],
      brand,
    ),
    page(
      "Courses",
      "courses",
      "Bright Minds courses, timings and monthly fees: Class 6–12 tuition, board preparation, JEE and NEET foundation, English and coding.",
      [
        ui.intro(
          "COURSES, TIMINGS & FEES",
          "Find the right batch.",
          "Fees are per month and include study material and tests. Siblings get 10% off.",
        ),
        listing(courses, { title: "", style: "list", columns: 2 }),
        ui.cta(
          "FOUND THE RIGHT COURSE?",
          "Ask for a seat.",
          "Admissions close for a course when its seats are taken.",
          ["Ask for admission", admit],
        ),
      ],
      brand,
    ),
    page(
      "Admissions",
      "admissions",
      "Ask for admission at Bright Minds: choose a course with seats left and we’ll call to book a free trial class.",
      [
        appSection(formNamed(app, "Admission enquiry")),
        ui.faq("About admissions", [
          [
            "Is there an entrance test?",
            "No. We do a short, friendly assessment in the trial class to place your child in the right group.",
          ],
          [
            "What does it cost to join?",
            "A one-time ₹1,000 registration fee covers books and test papers for the year, plus the monthly course fee.",
          ],
          [
            "What if the course is full?",
            "The form tells you straight away. Call us to join the waiting list; seats often open after the first month.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Fees",
      "fees",
      "Parents: check your child’s Bright Minds fee record, monthly fee and every payment with the phone number you registered.",
      [
        appSection(formNamed(app, "My fees"), { padding: 64 }),
        ui.faq("Paying fees", [
          [
            "How can I pay?",
            "By UPI, bank transfer or cash at the front desk, by the 10th of each month.",
          ],
          [
            "My payment isn’t showing.",
            "Payments appear once the office records them, usually the same day. Call us if it’s been longer.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Visit Bright Minds at 3rd floor, Sai Plaza, 2nd Avenue, Anna Nagar, Chennai, or send us a question about courses and timings.",
      [
        ui.contact(
          "Questions about courses or timings?",
          "3rd floor, Sai Plaza, 2nd Avenue, Anna Nagar, Chennai 600040 · +91 44 2621 8800\nOffice open 10 am–7 pm, Monday to Saturday.",
        ),
      ],
      brand,
    ),
  ];
  return {
    header,
    footer,
    pages,
    collections: [courses],
    app,
    theme: {
      accent: "#2d5bd3",
      background: "#fffdf7",
      color: "#1d2440",
      font: "modern",
      radius: 14,
    },
  };
}
