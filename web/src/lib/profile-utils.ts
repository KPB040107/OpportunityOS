export const interestTypes = ['internship', 'hackathon', 'scholarship', 'program', 'job'] as const;

export function splitSkillNames<T extends { name: string }>(entries: T[]): T[] {
  return entries.flatMap((entry) =>
    entry.name
      .split(',')
      .map((name) => ({ ...entry, name: name.trim() }))
      .filter((entry) => entry.name.length > 0)
  );
}
