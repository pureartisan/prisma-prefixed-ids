import { Prisma, type PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";

// For TypeScript utility
type Nullable<T> = T | null;

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

// All possible relation operations in Prisma
const RELATION_OPERATIONS = [
  "create",
  "createMany",
  "connectOrCreate",
  "upsert",
  "update",
  "updateMany",
] as const;

type RelationOperation = (typeof RELATION_OPERATIONS)[number];

// Helper to find the relation model from DMMF
const findRelationModel = (
  dmmf: any,
  parentModel: string,
  fieldName: string,
): string | null => {
  // Find the model in DMMF
  const model = dmmf.datamodel.models.find((m: any) => m.name === parentModel);
  if (!model) {
    return null;
  }

  // Find the field that matches the relation name
  const field = model.fields.find((f: any) => f.name === fieldName);
  if (!field || field.kind !== "object") {
    return null;
  }

  // Return the related model name
  return field.type;
};

// Helper function to check if key is a relation operation
const isRelationOperation = (key: string): key is RelationOperation => {
  return RELATION_OPERATIONS.includes(key as RelationOperation);
};

// Helper function to process nested data with proper model detection
const processNestedData = <T extends ModelName>(
  data: any,
  model: T,
  prefixedId: (model: T) => string | null,
  dmmf: any,
): any => {
  if (!data) {
    return data;
  }

  // Handle array of items
  if (Array.isArray(data)) {
    return data.map((item) => processNestedData(item, model, prefixedId, dmmf));
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

    // Process nested relations by checking each key in the object
    for (const [key, value] of Object.entries(result) as [string, any][]) {
      if (!value || typeof value !== "object") continue;

      // CASE 1: Key itself is a relation operation (root level operation)
      if (isRelationOperation(key)) {
        // Find which field this operation belongs to by looking at non-operation keys
        const relationFields = Object.keys(result).filter(
          (k) => !isRelationOperation(k),
        );

        for (const relationField of relationFields) {
          const relatedModel = findRelationModel(dmmf, model, relationField);
          if (relatedModel) {
            if (key === "createMany" && "data" in value) {
              // Handle createMany operation
              const createManyOp = value as CreateManyOperation;
              result[key] = {
                ...value,
                data: processNestedData(
                  createManyOp.data,
                  relatedModel as T,
                  prefixedId,
                  dmmf,
                ),
              };
            } else if (key === "upsert") {
              // Handle upsert operation (has create and update)
              result[key] = {
                ...value,
                create: value.create
                  ? processNestedData(
                      value.create,
                      relatedModel as T,
                      prefixedId,
                      dmmf,
                    )
                  : value.create,
                update: value.update
                  ? processNestedData(
                      value.update,
                      relatedModel as T,
                      prefixedId,
                      dmmf,
                    )
                  : value.update,
              };
            } else if (key === "connectOrCreate") {
              // Handle connectOrCreate operation
              result[key] = {
                ...value,
                create: value.create
                  ? processNestedData(
                      value.create,
                      relatedModel as T,
                      prefixedId,
                      dmmf,
                    )
                  : value.create,
              };
            } else {
              // For other operations like create, update
              result[key] = processNestedData(
                value,
                relatedModel as T,
                prefixedId,
                dmmf,
              );
            }
            break;
          }
        }
      }
      // CASE 2: Key might be a relation field that contains operations
      else {
        const relatedModel = findRelationModel(dmmf, model, key);
        if (!relatedModel) continue;

        // Process all possible operations in this relation field
        const updatedValue = { ...value };

        // Process each operation type
        for (const op of RELATION_OPERATIONS) {
          if (!(op in value)) continue;

          if (op === "createMany" && "data" in value[op]) {
            updatedValue[op] = {
              ...value[op],
              data: processNestedData(
                value[op].data,
                relatedModel as T,
                prefixedId,
                dmmf,
              ),
            };
          } else if (op === "upsert") {
            updatedValue[op] = {
              ...value[op],
              create: value[op].create
                ? processNestedData(
                    value[op].create,
                    relatedModel as T,
                    prefixedId,
                    dmmf,
                  )
                : value[op].create,
              update: value[op].update
                ? processNestedData(
                    value[op].update,
                    relatedModel as T,
                    prefixedId,
                    dmmf,
                  )
                : value[op].update,
            };
          } else if (op === "connectOrCreate") {
            updatedValue[op] = {
              ...value[op],
              create: value[op].create
                ? processNestedData(
                    value[op].create,
                    relatedModel as T,
                    prefixedId,
                    dmmf,
                  )
                : value[op].create,
            };
          } else {
            // create, update, etc.
            updatedValue[op] = processNestedData(
              value[op],
              relatedModel as T,
              prefixedId,
              dmmf,
            );
          }
        }

        result[key] = updatedValue;
      }
    }

    return result;
  }

  return data;
};

export function createPrefixedIdsExtension<ModelName extends string>(
  config: PrefixConfig<ModelName>,
  dmmf: any,
): {
  name: string;
  query: {
    $allModels: {
      create: (args: QueryArgs) => Promise<any>;
      createMany: (args: QueryArgs) => Promise<any>;
      update: (args: QueryArgs) => Promise<any>;
      updateMany: (args: QueryArgs) => Promise<any>;
      upsert: (args: QueryArgs) => Promise<any>;
      connectOrCreate: (args: QueryArgs) => Promise<any>;
    };
  };
} {
  if (!dmmf) {
    throw new Error("DMMF is required for prefixed IDs extension");
  }

  const { prefixes, idGenerator = defaultIdGenerator } = config;

  const prefixedId = (modelName: ModelName): string | null => {
    if (modelName in prefixes) {
      return idGenerator(prefixes[modelName] as string);
    }
    return null;
  };

  const createOperationHandler = (operation: string) => {
    return ({ args, query, model }: QueryArgs): Promise<any> => {
      if (args.data && dmmf) {
        args.data = processNestedData(
          args.data,
          model as ModelName,
          prefixedId,
          dmmf,
        );
      }
      return query(args);
    };
  };

  return {
    name: "prefixedIds",
    query: {
      $allModels: {
        create: createOperationHandler("create"),
        createMany: createOperationHandler("createMany"),
        update: createOperationHandler("update"),
        updateMany: createOperationHandler("updateMany"),
        upsert: createOperationHandler("upsert"),
        connectOrCreate: createOperationHandler("connectOrCreate"),
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
  const dmmf = getDMMF(prisma);
  return prisma.$extends(createPrefixedIdsExtension(config, dmmf));
}

// Helper function to get DMMF from a Prisma Client instance or query context
export function getDMMF(clientOrContext: PrismaClient | any): any {
  return (
    (clientOrContext as any)._baseDmmf ||
    (clientOrContext as any)._dmmf ||
    (clientOrContext as any)._client?._baseDmmf ||
    (clientOrContext as any)._client?._dmmf
  );
}

// Helper function to get all model names from a Prisma Client instance
export function getModelNames(prismaClient: PrismaClient): string[] {
  const dmmf = getDMMF(prismaClient);
  if (!dmmf) return [];

  return dmmf.datamodel.models.map((model: any) => model.name);
}
