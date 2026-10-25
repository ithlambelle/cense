// Penny's checked answers (Ask Penny, S34; Flow 5 frames 144:3045). Every
// answer was read against the official page it cites on 2026-10-25, and every
// number in it appears on that page. Change an answer only after re-reading
// its source. A tapped question shows its answer exactly as written here; a
// typed question is answered by the model from these facts only
// (lib/penny/ask.ts), and the source shown always comes from this file.
//
// Copy rules: plain words, 25 to 55 words, no dashes, tildes or semicolons,
// how things work and never what this student should do with their money, and
// no card, bank, app or investment named (answers.test.ts checks them).

export const PENNY_TOPICS = [
  { slug: "credit", label: "Credit" },
  { slug: "budgeting", label: "Budgeting" },
  { slug: "saving", label: "Saving" },
  { slug: "student-loans", label: "Student loans" },
] as const;

export type PennyTopic = (typeof PENNY_TOPICS)[number]["slug"];

export type PennyAnswer = {
  id: string;
  topic: PennyTopic;
  // The words on the button, and the student's bubble when it is tapped.
  question: string;
  answer: string;
  source: { name: string; url: string };
};

export const PENNY_ANSWERS = [
  {
    id: "credit-card-basics",
    topic: "credit",
    question: "How does a credit card work?",
    answer:
      "A credit card lets you borrow money to pay for things. You repay the card company by the payment due date. Paying less than the full amount brings interest charges, and paying late usually adds a late fee. Debit and prepaid cards are different, since they spend money you already have.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/ask-cfpb/how-are-prepaid-cards-debit-cards-and-credit-cards-different-en-433/" },
  },
  {
    id: "credit-score",
    topic: "credit",
    question: "What is a credit score?",
    answer:
      "A credit score is a number that predicts how likely you are to repay a loan on time. It is built from your credit reports, including your bill-paying history and how much of your available credit you use. Lenders, landlords and insurers use it. Most scores range from 300 to 850.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-score-en-315/" },
  },
  {
    id: "preapproval-vs-applying",
    topic: "credit",
    question: "Preapproval vs. applying",
    answer:
      "Preapproval comes from a lender prescreening your credit file, which counts as a soft inquiry. Soft inquiries do not affect your score, so it stays the same. Applying is what triggers a hard inquiry. Lenders use it to decide on approval, and hard inquiries can affect your score.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-inquiry-en-1317/" },
  },
  {
    id: "avoid-interest",
    topic: "credit",
    question: "How do I avoid paying interest?",
    answer:
      "Most cards have a grace period between the end of a billing cycle and the due date. Paying the full balance by the due date means no interest on new purchases. Paying less ends the grace period, so interest applies to the unpaid part and new purchases. Cash advances usually start interest right away.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-grace-period-for-a-credit-card-en-47/" },
  },
  {
    id: "secured-card",
    topic: "credit",
    question: "What is a secured card?",
    answer:
      "With a secured card, you deposit money with the bank or credit union, then spend that money using the card. It is one option if you cannot get a regular credit card. It can help build credit history when the card reports to the three credit bureaus.",
    source: { name: "FTC", url: "https://consumer.gov/credit/getting-credit-card" },
  },
  {
    id: "using-a-credit-card",
    topic: "credit",
    question: "How to use a credit card?",
    answer:
      "Every purchase is money you borrow, and one bill arrives each month for all of it. Paying the whole bill each month usually means no interest. Paying only the minimum means interest on the rest. Missing the minimum can raise your interest rate, add fees and damage your credit.",
    source: { name: "FTC", url: "https://consumer.gov/credit/getting-credit-card" },
  },
  {
    id: "credit-limit-utilization",
    topic: "credit",
    question: "What is a credit limit and utilization?",
    answer:
      "Your credit limit is the most you can borrow on the card. Utilization is how much of that limit you are using. A common expert guideline is staying under 30 percent of the limit, because higher use can lower your credit scores and make future borrowing cost more.",
    source: { name: "CFPB", url: "https://files.consumerfinance.gov/f/documents/cfpb_adult-fin-ed_how-to-find-the-best-credit-card.pdf" },
  },
  {
    id: "paying-late",
    topic: "credit",
    question: "What happens if I pay late?",
    answer:
      "Paying on time means paying at least the minimum by the due date. Missing it can bring a late fee and a higher penalty rate on new purchases. It can also end an introductory rate, moving your existing balance to the higher long-term rate. Late or missed payments can also hurt your credit history.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/data-research/credit-card-data/know-you-owe-credit-cards/" },
  },
  {
    id: "student-budget",
    topic: "budgeting",
    question: "How to budget as a student?",
    answer:
      "A budget starts with simple math, your income minus your expenses. Building one means picking a timeframe and goals, choosing a tool, listing money in and money out, then subtracting to see if there is money left over or a shortfall. Tracking spending and updating the budget over time are part of it.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/resources/prepare-for-college/students/budgeting" },
  },
  {
    id: "fixed-vs-variable",
    topic: "budgeting",
    question: "Fixed vs. variable expenses",
    answer:
      "Fixed expenses stay about the same each month, like rent, car payments and insurance. Variable expenses are flexible and change month to month, like groceries, clothing, eating out and entertainment. For bills that cover several months, dividing the amount by the number of months shows the monthly share.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/resources/prepare-for-college/students/budgeting/creating-your-budget" },
  },
  {
    id: "needs-vs-wants",
    topic: "budgeting",
    question: "Needs vs. wants",
    answer:
      "A need is something essential, and a want is something you would like. One budgeting method lists what you hope to save for, labels each item a need or a want, then ranks them by priority. Asking if you would still be happy with a want a month later can help.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/resources/prepare-for-college/students/budgeting/budgeting-tips" },
  },
  {
    id: "tracking-spending",
    topic: "budgeting",
    question: "How do I track my spending?",
    answer:
      "Tracking works as a monthly cycle. At the start of the month, you plan how the money will be spent. Each day, you write down what you actually spent. At the end of the month, you compare spending with the plan and use what you learn to plan the next month.",
    source: { name: "FTC", url: "https://consumer.gov/your-money/making-budget" },
  },
  {
    id: "overdraft-fees",
    topic: "budgeting",
    question: "What is an overdraft fee?",
    answer:
      "An overdraft is when your bank lets a debit card purchase or ATM withdrawal go through without enough money in your account. Banks cannot charge a fee for that unless you opted in. If you overdraw, you owe the fee plus the amount you were short. Without opting in, those transactions could be declined.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/paying-for-college/manage-your-college-money/" },
  },
  {
    id: "buy-now-pay-later",
    topic: "budgeting",
    question: "How does buy now, pay later work?",
    answer:
      "Buy now, pay later is a type of installment loan that lets you buy something now and pay it off in four or fewer payments. Many of these loans charge no interest, but most charge late fees for missed payments. Your payment history may not be reported to credit reporting companies.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/ask-cfpb/what-is-a-buy-now-pay-later-bnpl-loan-en-2119/" },
  },
  {
    id: "emergency-fund",
    topic: "saving",
    question: "Why have an emergency fund?",
    answer:
      "An emergency fund is cash set aside for surprise costs like car repairs, medical bills or a lost income. Without savings, even a small shock can push people toward credit cards or loans, and that debt is generally harder to pay off. Even a small amount saved offers some security.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/" },
  },
  {
    id: "fdic-insurance",
    topic: "saving",
    question: "Is my money safe in a bank?",
    answer:
      "At an FDIC-insured bank, money in checking and savings accounts is protected if the bank fails. Coverage is $250,000 per depositor, per insured bank, for each ownership category. Stocks, bonds, mutual funds and crypto are not covered, even when a bank offers them. Since 1933, no one has lost insured money.",
    source: { name: "FDIC", url: "https://www.fdic.gov/resources/deposit-insurance/understanding-deposit-insurance" },
  },
  {
    id: "saving-on-small-income",
    topic: "saving",
    question: "How can I save on a small income?",
    answer:
      "Saving can start with any amount, no matter how small, even without a big salary or steady pay. Setting money aside before spending it is called paying yourself first. Adding to savings consistently, plus interest, can grow into much more over time.",
    source: { name: "FDIC", url: "https://www.fdic.gov/consumer-resource-center/2024-01/starting-small-can-lead-big-savings" },
  },
  {
    id: "savings-vs-checking",
    topic: "saving",
    question: "Savings vs. checking",
    answer:
      "A checking account handles everyday money. It lets you pay with a debit card or check, get cash from an ATM and pay bills online. A savings account keeps money separate from monthly spending, for emergencies or goals. Some banks and credit unions pay a little interest on it.",
    source: { name: "FTC", url: "https://consumer.gov/your-money/opening-bank-account" },
  },
  {
    id: "automatic-saving",
    topic: "saving",
    question: "How do I make saving automatic?",
    answer:
      "A common way is a recurring transfer through your bank or credit union that moves a set amount from checking to savings. Some employers can also split a direct-deposit paycheck between checking and savings. You choose how much and how often. If checking runs short when a transfer happens, overdraft fees can apply.",
    source: { name: "CFPB", url: "https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/" },
  },
  {
    id: "federal-vs-private-loans",
    topic: "student-loans",
    question: "Federal vs. private loans",
    answer:
      "Federal student loans come from the government, with terms set by law, fixed interest rates and repayment plans tied to income. Private loans come from lenders like banks, credit unions or schools, with terms set by the lender. They often need a credit record or cosigner and are generally more expensive.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/understand-aid/types/loans/federal-vs-private" },
  },
  {
    id: "subsidized-vs-unsubsidized",
    topic: "student-loans",
    question: "Subsidized vs. unsubsidized loans",
    answer:
      "Both are federal student loans. Subsidized loans are for undergraduates with financial need. The government pays their interest while you are in school at least half-time, for six months after you leave and during deferment. Unsubsidized loans do not require need, and you owe all the interest, even during school.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/understand-aid/types/loans/subsidized-unsubsidized" },
  },
  {
    id: "repayment-start",
    topic: "student-loans",
    question: "When do I start repaying loans?",
    answer:
      "Federal student loans enter repayment once you graduate, leave school or drop below half-time. Direct Subsidized and Unsubsidized Loans then have a six-month grace period before regular payments start. Your loan servicer sends a schedule showing when the first payment is due, how many payments there are and how much each is.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/manage-loans/repayment" },
  },
  {
    id: "fafsa",
    topic: "student-loans",
    question: "What is the FAFSA?",
    answer:
      "The FAFSA is the Free Application for Federal Student Aid. Schools use it to figure out how much aid you can get, including grants, scholarships, work-study and loans. Any student can file it, regardless of income. It has to be filed every year, and some states set their own deadlines.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/h/apply-for-aid/fafsa" },
  },
  {
    id: "missed-loan-payment",
    topic: "student-loans",
    question: "What if I miss a student loan payment?",
    answer:
      "A federal student loan becomes delinquent the day after a missed payment. After 90 days, the servicer reports it to the national credit bureaus, which can hurt your credit. After at least 270 days without payments, a Direct Loan is in default, which can bring wage garnishment and loss of further federal aid.",
    source: { name: "Federal Student Aid", url: "https://studentaid.gov/manage-loans/default" },
  },
] as const satisfies readonly PennyAnswer[];

export type PennyAnswerId = (typeof PENNY_ANSWERS)[number]["id"];

export const PENNY_ANSWER_IDS = PENNY_ANSWERS.map((answer) => answer.id) as [PennyAnswerId, ...PennyAnswerId[]];

// The two starter questions on Learn (144:3071).
export const STARTER_IDS = ["using-a-credit-card", "student-budget"] as const satisfies readonly PennyAnswerId[];

// What each topic page lists, in order. Credit is the frame's list word for
// word (144:3285); the others follow it. The rest of a topic's answers are
// reached from Learn's starters or by asking.
export const TOPIC_QUESTIONS: Record<PennyTopic, readonly PennyAnswerId[]> = {
  credit: ["credit-card-basics", "credit-score", "preapproval-vs-applying", "avoid-interest", "secured-card"],
  budgeting: ["fixed-vs-variable", "needs-vs-wants", "tracking-spending", "overdraft-fees", "buy-now-pay-later"],
  saving: ["emergency-fund", "fdic-insurance", "saving-on-small-income", "savings-vs-checking", "automatic-saving"],
  "student-loans": [
    "federal-vs-private-loans",
    "subsidized-vs-unsubsidized",
    "repayment-start",
    "fafsa",
    "missed-loan-payment",
  ],
};

export function findAnswer(id: string): PennyAnswer | undefined {
  return PENNY_ANSWERS.find((answer) => answer.id === id);
}

export function findTopic(slug: string) {
  return PENNY_TOPICS.find((topic) => topic.slug === slug);
}

export function topicAnswers(slug: PennyTopic): PennyAnswer[] {
  return TOPIC_QUESTIONS[slug].map((id) => findAnswer(id)).filter((answer) => answer !== undefined);
}
