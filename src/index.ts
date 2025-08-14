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
          if (args.data && !args.data.id) {
            const id = prefixedId(model as ModelName);
            if (id) {
              args.data.id = id;
            }
          }
          return query(args);
        },

        createMany: ({ args, query, model }: QueryArgs): Promise<any> => {
          if (model in prefixes && args.data && Array.isArray(args.data)) {
            args.data = (args.data as Record<string, any>[]).map((item) => {
              if (!item.id) {
                const id = prefixedId(model as ModelName);
                if (id) {
                  return {
                    ...item,
                    id,
                  };
                }
              }
              return item;
            });
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
    $extends: (extension: any) => any;
  } = PrismaClient,
>(
  prisma: Client,
  config: PrefixConfig<ModelName>,
): ReturnType<Client["$extends"]> {
  return prisma.$extends(createPrefixedIdsExtension(config));
}
