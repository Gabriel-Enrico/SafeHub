import { z } from 'zod';

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  additionalProperties?: boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

function asSchema(schema: JsonSchema, coerceQueryNumbers = false): z.ZodType {
  if (schema.anyOf || schema.oneOf) {
    const branches = (schema.anyOf ?? schema.oneOf ?? []).map((child) => asSchema(child, coerceQueryNumbers));
    if (branches.length === 1) return branches[0];
    if (branches.length > 1) return z.union(branches as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  }
  if (schema.allOf?.length) return schema.allOf.map((child) => asSchema(child, coerceQueryNumbers)).reduce((left, right) => left.and(right));
  if (schema.enum) {
    const values = schema.enum as [string, ...string[]];
    if (values.length === 0) return z.never();
    if (values.length && values.every((value) => typeof value === 'string')) {
      return z.enum(values as [string, ...string[]]);
    }
    if (values.length === 1) return z.literal(values[0]);
    return z.union(values.map((value) => z.literal(value)) as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const candidates = types.filter((type): type is string => Boolean(type)).map((type) => {
    switch (type) {
      case 'object': {
        const properties = Object.fromEntries(
          Object.entries(schema.properties ?? {}).map(([key, child]) => [key, asSchema(child, coerceQueryNumbers)])
        );
        const required = new Set(schema.required ?? []);
        let objectSchema = z.object(Object.fromEntries(
          Object.entries(properties).map(([key, child]) => [key, required.has(key) ? child : child.optional()])
        ));
        if (schema.additionalProperties === false) objectSchema = objectSchema.strict();
        if (schema.additionalProperties === true) objectSchema = objectSchema.passthrough();
        if (schema.minProperties !== undefined) objectSchema = objectSchema.refine((value) => Object.keys(value).length >= schema.minProperties!, 'Informe os campos obrigatórios.');
        if (schema.maxProperties !== undefined) objectSchema = objectSchema.refine((value) => Object.keys(value).length <= schema.maxProperties!, 'Há campos demais.');
        return objectSchema;
      }
      case 'array': {
        let arraySchema = z.array(schema.items ? asSchema(schema.items, coerceQueryNumbers) : z.unknown());
        if (schema.minItems !== undefined) arraySchema = arraySchema.min(schema.minItems);
        if (schema.maxItems !== undefined) arraySchema = arraySchema.max(schema.maxItems);
        if (schema.uniqueItems) arraySchema = arraySchema.refine((items) => new Set(items.map((item) => JSON.stringify(item))).size === items.length, 'Não repita valores.');
        return arraySchema;
      }
      case 'string': {
        let stringSchema = z.string();
        if (schema.minLength !== undefined) stringSchema = stringSchema.min(schema.minLength);
        if (schema.maxLength !== undefined) stringSchema = stringSchema.max(schema.maxLength);
        if (schema.pattern) stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        if (schema.format === 'email') stringSchema = stringSchema.email();
        if (schema.format === 'date-time') stringSchema = stringSchema.datetime({ offset: true });
        if (schema.format === 'uri') stringSchema = stringSchema.url();
        return stringSchema;
      }
      case 'integer': {
        let numberSchema = (coerceQueryNumbers ? z.coerce.number() : z.number()).int();
        if (schema.minimum !== undefined) numberSchema = numberSchema.min(schema.minimum);
        if (schema.maximum !== undefined) numberSchema = numberSchema.max(schema.maximum);
        return numberSchema;
      }
      case 'number': {
        let numberSchema = coerceQueryNumbers ? z.coerce.number() : z.number();
        if (schema.minimum !== undefined) numberSchema = numberSchema.min(schema.minimum);
        if (schema.maximum !== undefined) numberSchema = numberSchema.max(schema.maximum);
        return numberSchema;
      }
      case 'boolean': return z.boolean();
      case 'null': return z.null();
      default: return z.unknown();
    }
  });
  if (!candidates.length) return z.unknown();
  return candidates.length === 1 ? candidates[0] : z.union(candidates as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
}

export function zodValidatorCompiler({ schema, httpPart }: { schema: JsonSchema; httpPart?: string }) {
  const validator = asSchema(schema, httpPart === 'querystring');
  return (data: unknown) => {
    const result = validator.safeParse(data);
    if (result.success) return { value: result.data };
    const error = new Error('A requisição contém dados inválidos.') as Error & {
      validation: Array<{ instancePath: string; message: string; keyword: string }>;
      validationContext: string;
    };
    error.validation = result.error.issues.map((issue) => ({
      instancePath: `/${issue.path.join('/')}`,
      message: issue.message,
      keyword: issue.code,
    }));
    error.validationContext = 'request';
    return { error };
  };
}
