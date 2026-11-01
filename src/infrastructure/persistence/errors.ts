export const isUniqueConstraintError = (error: unknown): boolean => {
  const visited = new Set<Error>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    const code = "code" in current ? current.code : undefined;
    const extendedCode =
      "extendedCode" in current ? current.extendedCode : undefined;
    const rawCode = "rawCode" in current ? current.rawCode : undefined;
    if (
      code === "SQLITE_CONSTRAINT_UNIQUE" ||
      extendedCode === "SQLITE_CONSTRAINT_UNIQUE" ||
      extendedCode === 2067 ||
      rawCode === 2067
    )
      return true;
    if (
      (code === undefined || code === "SQLITE_CONSTRAINT") &&
      extendedCode === undefined &&
      (rawCode === undefined || rawCode === 19) &&
      /^(?:SQLITE_CONSTRAINT(?:_UNIQUE)?: )?UNIQUE constraint failed(?:$|[:.\s])/i.test(
        current.message,
      )
    )
      return true;
    current = current.cause;
  }
  return false;
};

export const isForeignKeyConstraintError = (error: unknown): boolean => {
  const visited = new Set<Error>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    const code = "code" in current ? current.code : undefined;
    const extendedCode =
      "extendedCode" in current ? current.extendedCode : undefined;
    const rawCode = "rawCode" in current ? current.rawCode : undefined;
    if (
      code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
      extendedCode === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
      rawCode === 787
    )
      return true;
    if (
      (code === undefined ||
        code === "SQLITE_CONSTRAINT" ||
        code === "SQLITE_CONSTRAINT_TRIGGER") &&
      (rawCode === undefined || rawCode === 19 || rawCode === 1811) &&
      /^(?:SQLITE_CONSTRAINT(?:_TRIGGER)?: )?FOREIGN KEY constraint failed(?:$|[.\s])/i.test(
        current.message,
      )
    )
      return true;
    current = current.cause;
  }
  return false;
};
