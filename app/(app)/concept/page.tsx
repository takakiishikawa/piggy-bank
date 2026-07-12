import { ConceptPage } from "@takaki/go-design-system";
import { Leaf } from "lucide-react";

export default function ConceptPageRoute() {
  return (
    <ConceptPage
      productName="PiggyBank"
      productLogo={<Leaf size={20} style={{ color: "var(--color-primary)" }} />}
      tagline="Keep your base spending low, spend freely when it counts."
      coreMessage="PiggyBank is a household budget tool built around 'value-driven choices,' not white-knuckle saving. It automatically pulls payment emails from Gmail and turns them into a clear picture of your spending. Every month's surplus flows into a 'reservoir,' ready to release when you actually want to spend it."
      coreValue="Saving money is really about designing freedom. The lower your base spending, the more options you have in life. PiggyBank goes beyond just logging expenses — it continuously helps you decide where not to spend, and points the way toward financial freedom."
      scope={{
        solve: [
          "Automatically pulling spending data from Gmail",
          "Visualizing spending by category and spotting trends",
          "Monthly/weekly reports with AI feedback",
          "Calculating and tracking your reservoir savings balance",
          "Establishing a baseline for fixed vs. variable costs",
        ],
        notSolve: [
          "Bank or brokerage account integration",
          "Investment portfolio management",
          "Multi-currency or multi-person household management",
          "Loan or insurance management",
          "Automatic budget allocation",
        ],
      }}
      productLogic={{
        steps: [
          {
            title: "Automatic email import",
            description:
              "AI parses payment notification emails from Gmail and automatically extracts the store, amount, and date.",
          },
          {
            title: "AI categorization",
            description:
              "Learns from past data for the same store and automatically sorts spending into categories like Dining Out or Transport.",
          },
          {
            title: "Spending pattern analysis",
            description:
              "Weekly and monthly reports visualize how your spending moves. AI suggests concrete ways to improve.",
          },
          {
            title: "Building your reservoir",
            description:
              "The gap between your target budget and actual spending builds up in your 'reservoir,' ready for the next big purchase.",
          },
        ],
        outcome: "Lower base spending, more breathing room each month, less money anxiety",
      }}
      resultMetric={{
        title: "Reducing monthly base spending",
        description:
          "The goal is to cut unconscious, habitual spending by an average of 15% within 3 months of starting. Over a year, that adds up to a meaningful difference — accumulating in your reservoir balance.",
      }}
      behaviorMetrics={[
        {
          title: "Weekly check-in rate",
          description:
            "Measures whether checking your weekly report has become a habit. Target: 4+ times a month",
        },
        {
          title: "Categorization completion rate",
          description:
            "Keeps transactions left uncategorized as 'Other' close to zero. Target: 95%+",
        },
        {
          title: "Reservoir growth rate",
          description:
            "Measures the share of months where your reservoir balance grows. Target: 75%+ of months",
        },
        {
          title: "AI feedback view rate",
          description:
            "Share of sessions where you view the AI comment on your weekly report. Target: 60%+",
        },
      ]}
    />
  );
}
