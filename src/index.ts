import { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";

// Define ModelName type based on Prisma's model names
type ModelName = string;

export type PrefixConfig<ModelName extends string> = {
  prefixes: Record<ModelName, string>;
  idGenerator?: (prefix: string) => string;
};

const defaultIdGenerator = (prefix: string) => {
  const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);
  return `${prefix}_${nanoid()}`;
};

type QueryArgs = {
  args: any;
  query: (args: any) => Promise<any>;
  model: ModelName;
};

export function createPrefixedIdsExtension<ModelName extends string>(
  config: PrefixConfig<ModelName>
) {
  const { prefixes, idGenerator = defaultIdGenerator } = config;

  const prefixedId = (modelName: ModelName) => {
    if (modelName in prefixes) {
      return idGenerator(prefixes[modelName]);
    }
    return null;
  };

  return {
    name: "prefixedIds",
    query: {
      $allModels: {
        create: ({ args, query, model }: QueryArgs) => {
          if (args.data && !args.data.id) {
            const id = prefixedId(model as ModelName);
            if (id) {
              args.data.id = id;
            }
          }
          return query(args);
        },

        createMany: ({ args, query, model }: QueryArgs) => {
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

export function extendPrismaClient<ModelName extends string = string>(
  prisma: PrismaClient,
  config: PrefixConfig<ModelName>
) {
  return prisma.$extends(createPrefixedIdsExtension(config));
}
