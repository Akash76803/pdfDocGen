import { z } from 'zod';
import { DataSourceSchema, NormalizedData } from '@document-tool/contracts';

export const FieldDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array']),
  required: z.boolean(),
  description: z.string().optional(),
});

export const DataSourceSchemaSchema: z.ZodType<DataSourceSchema> = z.object({
  fields: z.array(FieldDefinitionSchema),
  metadata: z.record(z.any()).optional(),
});

export const NormalizedValueSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.lazy(() => NormalizedValueSchema)),
    z.array(z.lazy(() => NormalizedValueSchema)),
  ])
);

export const NormalizedRecordSchema = z.record(NormalizedValueSchema);

export const NormalizedDataSchema: z.ZodType<NormalizedData> = z.object({
  schema: DataSourceSchemaSchema,
  records: z.array(NormalizedRecordSchema),
  metadata: z.record(z.any()).optional(),
});
