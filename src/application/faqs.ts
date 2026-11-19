import type { Faq, FaqRequest, FaqSortRequest } from "../contracts/faqs.ts";
import { faqAnswerMaxLength, faqQuestionMaxLength } from "../contracts/faqs.ts";
import { ApplicationError } from "./errors.ts";
import type { FaqsRepository } from "./ports/faqs.ts";
import { requiredString } from "./validation.ts";

const parseFaq = (input: Record<string, unknown>): FaqRequest => ({
  answer: requiredString(input.answer, "answer", faqAnswerMaxLength),
  question: requiredString(input.question, "question", faqQuestionMaxLength),
});

const parseSortIds = (ids: unknown): FaqSortRequest["ids"] => {
  if (
    !Array.isArray(ids) ||
    !ids.every(
      (id: unknown): id is Faq["id"] =>
        typeof id === "string" && id.trim().length > 0,
    ) ||
    new Set(ids).size !== ids.length
  )
    throw new ApplicationError("invalid", "fieldInvalid", { field: "ids" });

  return ids;
};

export const createFaqsService = (repository: FaqsRepository) => ({
  create: async (input: Record<string, unknown>) => {
    const faq = { id: crypto.randomUUID(), ...parseFaq(input) };
    await repository.create(faq);
    return faq;
  },
  get: async (id: Faq["id"]) => {
    const faq = await repository.find(id);
    if (!faq) throw new ApplicationError("not-found", "faqNotFound");
    return faq;
  },
  list: () => repository.list(),
  remove: async (id: Faq["id"]) => {
    if (!(await repository.remove(id)))
      throw new ApplicationError("not-found", "faqNotFound");
  },
  sort: async (input: Record<string, unknown>) => {
    if (!(await repository.sort(parseSortIds(input.ids))))
      throw new ApplicationError("conflict", "faqOrderChanged");
  },
  update: async (id: Faq["id"], input: Record<string, unknown>) => {
    const faq = await repository.update(id, parseFaq(input));
    if (!faq) throw new ApplicationError("not-found", "faqNotFound");
    return faq;
  },
});
