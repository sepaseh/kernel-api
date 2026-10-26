import { ApplicationError } from "./errors.ts";

const defaultMaximumStringLength = 1000;

export const requiredString = (
  value: unknown,
  name: string,
  maximum = defaultMaximumStringLength,
) => {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result)
    throw new ApplicationError("invalid", "fieldRequired", { field: name });
  if (result.length > maximum)
    throw new ApplicationError("invalid", "fieldInvalid", { field: name });
  return result;
};

export const optionalString = (
  value: unknown,
  name: string,
  maximum = defaultMaximumStringLength,
) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new ApplicationError("invalid", "fieldInvalid", { field: name });
  if (!value.trim()) return undefined;
  return requiredString(value, name, maximum);
};
