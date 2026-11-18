import type { Faq, FaqRequest } from "../../contracts/faqs.ts";

export type FaqsRepository = {
  create(faq: Faq): Promise<void>;
  find(id: Faq["id"]): Promise<Faq | undefined>;
  list(): Promise<Faq[]>;
  remove(id: Faq["id"]): Promise<boolean>;
  sort(ids: Faq["id"][]): Promise<boolean>;
  update(id: Faq["id"], faq: FaqRequest): Promise<Faq | undefined>;
};
