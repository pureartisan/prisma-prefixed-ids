import type { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";

// Define ModelName type based on Prisma's model names
type ModelName = string;

export type PrefixConfig<ModelName extends string> = {
  prefixes: Partial<Record<ModelName, string>>;
  idGenerator?: (prefix: string) => string;
};

const defaultIdGenerator = (prefix: string): string => {
  const nanoid = customAlphabet(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    24,
  );
  return `${prefix}_${nanoid()}`;
};

type QueryArgs = {
  args: any;
  query: (args: any) => Promise<any>;
  model: ModelName;
};

interface CreateManyOperation {
  data: any[];
}

// Helper function to process nested data
const processNestedData = <T extends ModelName>(
  data: any,
  model: T,
  prefixedId: (model: T) => string | null,
): any => {
  if (!data) return data;

  // Handle array of items
  if (Array.isArray(data)) {
    return data.map((item) => processNestedData(item, model, prefixedId));
  }

  // Handle object
  if (typeof data === "object") {
    const result: any = { ...data };

    // Generate ID for the current model if needed
    if (!result.id) {
      const id = prefixedId(model);
      if (id) {
        result.id = id;
      }
    }

    // Process nested relations
    for (const [key, value] of Object.entries(result)) {
      if (value && typeof value === "object") {
        // Handle create operations
        if (key === "create") {
          result[key] = processNestedData(value, model, prefixedId);
        } else if (key === "createMany" && "data" in value) {
          const createManyOp = value as CreateManyOperation;
          result[key] = {
            ...value,
            data: processNestedData(createManyOp.data, model, prefixedId),
          };
        }
        // Handle nested objects that might be relations
        else if (!Array.isArray(value) && value !== null) {
          // Convert relation field name to model name (e.g., 'posts' -> 'Post')
          const modelName = key.charAt(0).toUpperCase() + key.slice(1);
          result[key] = processNestedData(value, modelName as T, prefixedId);
        }
      }
    }

    return result;
  }

  return data;
};

export function createPrefixedIdsExtension<ModelName extends string>(
  config: PrefixConfig<ModelName>,
): {
  name: string;
  query: {
    $allModels: {
      create: (args: QueryArgs) => Promise<any>;
      createMany: (args: QueryArgs) => Promise<any>;
    };
  };
} {
  const { prefixes, idGenerator = defaultIdGenerator } = config;

  const prefixedId = (modelName: ModelName): string | null => {
    if (modelName in prefixes) {
      return idGenerator(prefixes[modelName] as string);
    }
    return null;
  };

  return {
    name: "prefixedIds",
    query: {
      $allModels: {
        create: ({ args, query, model }: QueryArgs): Promise<any> => {
          if (args.data) {
            args.data = processNestedData(
              args.data,
              model as ModelName,
              prefixedId,
            );
          }
          return query(args);
        },

        createMany: ({ args, query, model }: QueryArgs): Promise<any> => {
          if (args.data) {
            args.data = processNestedData(
              args.data,
              model as ModelName,
              prefixedId,
            );
          }
          return query(args);
        },
      },
    },
  };
}

export function extendPrismaClient<
  ModelName extends string = string,
  Client extends {
    $extends: (extension: any) => Client;
  } = PrismaClient & {
    $extends: (extension: any) => any;
  },
>(prisma: Client, config: PrefixConfig<ModelName>): Client {
  return prisma.$extends(createPrefixedIdsExtension(config));
}
