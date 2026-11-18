export const fileContexts = ["contents", "logo"] as const;

export type FileContext = (typeof fileContexts)[number];

export type StoredFileResponse = {
  id: string;
  is_used: boolean;
  size: number;
  url?: string;
};

export type UploadedFileResponse = StoredFileResponse & {
  content_type: string;
  visibility: "private" | "public";
};
