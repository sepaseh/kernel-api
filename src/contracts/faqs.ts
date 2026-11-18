export const faqAnswerMaxLength = 5000;
export const faqQuestionMaxLength = 300;

export type Faq = {
  answer: string;
  id: string;
  question: string;
};

export type FaqRequest = Pick<Faq, "answer" | "question">;
export type FaqSortRequest = { ids: Faq["id"][] };
