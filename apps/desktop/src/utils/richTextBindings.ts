export type RichTextBindingOption = {
  value: string;
  label: string;
  sourceField?: string;
  targetPath?: string;
};

export type RichTextBindingGroups<T extends RichTextBindingOption = RichTextBindingOption> = {
  calculated: T[];
  fields: T[];
};

/**
 * Phase 4.14: calculated fields are first-class rich-text bindings.
 * Keep the original option order inside each group so saved templates and
 * field-discovery ordering remain predictable.
 */
export function groupRichTextBindings<T extends RichTextBindingOption>(options: T[]): RichTextBindingGroups<T> {
  const calculated: T[] = [];
  const fields: T[] = [];
  for (const option of options) {
    if (option.value.startsWith('calc.')) calculated.push(option);
    else fields.push(option);
  }
  return { calculated, fields };
}
