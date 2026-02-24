import { customAlphabet } from "nanoid";

// Define ModelName type based on Prisma's model names
export type ModelName = string;

/**
 * Minimal interface representing a Prisma Client instance.
 * This allows the library to work with any Prisma Client version (v6, v7+)
 * without importing from @prisma/client directly.
 */
export interface PrismaClientLike {
  $extends: (extension: any) => any;
  [key: string]: any;
}

export type PrefixConfig<ModelName extends string> = {
  prefixes:
    | Partial<Record<ModelName, string>>
    | ((modelName: ModelName) => string | null);
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
export const findRelationModel = (
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
export const processNestedData = <T extends ModelName>(
  data: any,
  model: T,
  prefixedId: (model: T) => string | null,
  dmmf: any,
  shouldAddRootId: boolean = true,
): any => {
  if (!data) {
    return data;
  }

  // Handle array of items
  if (Array.isArray(data)) {
    return data.map((item) =>
      processNestedData(item, model, prefixedId, dmmf, shouldAddRootId),
    );
  }

  // Handle object
  if (typeof data === "object") {
    const result: any = { ...data };

    // Generate ID for the current model if needed (for nested creates)
    if (shouldAddRootId && !result.id) {
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
              const upsertItems = Array.isArray(value) ? value : [value];
              const processedUpserts = upsertItems.map((item: any) => ({
                ...item,
                create: item.create
                  ? processNestedData(
                      item.create,
                      relatedModel as T,
                      prefixedId,
                      dmmf,
                    )
                  : item.create,
                update: item.update
                  ? processNestedData(
                      item.update,
                      relatedModel as T,
                      prefixedId,
                      dmmf,
                      false,
                    )
                  : item.update,
              }));
              result[key] = Array.isArray(value)
                ? processedUpserts
                : processedUpserts[0];
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
            } else if (key === "create" || key === "createMany") {
              // Only process create operations with ID generation
              result[key] = processNestedData(
                value,
                relatedModel as T,
                prefixedId,
                dmmf,
              );
            } else {
              // For other operations like update, just pass through the value
              result[key] = value;
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
            const upsertItems = Array.isArray(value[op])
              ? value[op]
              : [value[op]];
            const processedUpserts = upsertItems.map((item: any) => ({
              ...item,
              create: item.create
                ? processNestedData(
                    item.create,
                    relatedModel as T,
                    prefixedId,
                    dmmf,
                  )
                : item.create,
              update: item.update
                ? processNestedData(
                    item.update,
                    relatedModel as T,
                    prefixedId,
                    dmmf,
                    false,
                  )
                : item.update,
            }));
            updatedValue[op] = Array.isArray(value[op])
              ? processedUpserts
              : processedUpserts[0];
          } else if (op === "connectOrCreate") {
            // Special handling for connectOrCreate - it's an array where each item has where/create
            if (Array.isArray(value[op])) {
              updatedValue[op] = value[op].map((connectOrCreateItem: any) => ({
                ...connectOrCreateItem,
                create: connectOrCreateItem.create
                  ? processNestedData(
                      connectOrCreateItem.create,
                      relatedModel as T,
                      prefixedId,
                      dmmf,
                      true,
                    )
                  : connectOrCreateItem.create,
              }));
            } else {
              // Fallback for non-array connectOrCreate (shouldn't happen in normal usage)
              updatedValue[op] = value[op];
            }
          } else if (op === "create" || op === "createMany") {
            // Only process create operations with ID generation
            updatedValue[op] = processNestedData(
              value[op],
              relatedModel as T,
              prefixedId,
              dmmf,
            );
          } else {
            // For other operations like update, just pass through the value
            updatedValue[op] = value[op];
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
    // Check if prefixes is a function
    if (typeof prefixes === "function") {
      const prefix = prefixes(modelName);
      if (prefix === null) {
        return null;
      }
      return idGenerator(prefix);
    }
    // Otherwise, treat it as an object/map
    if (modelName in prefixes) {
      return idGenerator(prefixes[modelName] as string);
    }
    return null;
  };

  const createOperationHandler = (operation: string) => {
    return ({ args, query, model }: QueryArgs): Promise<any> => {
      if (operation === "upsert") {
        // For upsert operations, add ID to create branch only
        if (args.create && !args.create.id) {
          const id = prefixedId(model as ModelName);
          if (id) {
            args.create.id = id;
          }
        }
        // Process nested data in both create and update branches
        if (dmmf) {
          if (args.create) {
            args.create = processNestedData(
              args.create,
              model as ModelName,
              prefixedId,
              dmmf,
              true,
            );
          }
          if (args.update) {
            args.update = processNestedData(
              args.update,
              model as ModelName,
              prefixedId,
              dmmf,
              false,
            );
          }
        }
      } else if (operation === "connectOrCreate") {
        // For connectOrCreate operations, add ID to create branch only
        if (args.create && !args.create.id) {
          const id = prefixedId(model as ModelName);
          if (id) {
            args.create.id = id;
          }
        }
        // Process nested data in create branch
        if (dmmf && args.create) {
          args.create = processNestedData(
            args.create,
            model as ModelName,
            prefixedId,
            dmmf,
            true,
          );
        }
      } else if (args.data) {
        if (operation === "createMany") {
          // For createMany, data is an array
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item: any) => {
              if (!item.id) {
                const id = prefixedId(model as ModelName);
                if (id) {
                  item.id = id;
                }
              }
              return item;
            });
          }
        } else if (operation === "create") {
          // For regular create operations only
          if (!args.data.id) {
            const id = prefixedId(model as ModelName);
            if (id) {
              args.data.id = id;
            }
          }
          // Process nested data to add IDs to nested creates
          if (dmmf) {
            args.data = processNestedData(
              args.data,
              model as ModelName,
              prefixedId,
              dmmf,
              true,
            );
          }
        } else if (operation === "update" || operation === "updateMany") {
          // For update operations, only process nested creates, don't add ID to root
          if (dmmf) {
            args.data = processNestedData(
              args.data,
              model as ModelName,
              prefixedId,
              dmmf,
              false,
            );
          }
        }
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
  Client extends PrismaClientLike = PrismaClientLike,
>(prisma: Client, config: PrefixConfig<ModelName>): Client {
  const dmmf = getDMMF(prisma);
  return prisma.$extends(createPrefixedIdsExtension(config, dmmf)) as Client;
}

// Helper function to get DMMF from a Prisma Client instance or query context
export function getDMMF(clientOrContext: PrismaClientLike | any): any {
  // Try newer structure first (_runtimeDataModel)
  if ((clientOrContext as any)._runtimeDataModel) {
    const modelsEntries = Object.entries(
      (clientOrContext as any)._runtimeDataModel.models,
    );

    return {
      datamodel: {
        models: modelsEntries.map(([name, model]: [string, any]) => ({
          name: name,
          fields: model.fields.map((field: any) => ({
            name: field.name,
            kind: field.relationName ? "object" : "scalar",
            type: field.type,
            isList: field.isList,
          })),
        })),
      },
    };
  }

  // Fallback to older structures
  return (
    (clientOrContext as any)._baseDmmf ||
    (clientOrContext as any)._dmmf ||
    (clientOrContext as any)._client?._baseDmmf ||
    (clientOrContext as any)._client?._dmmf
  );
}

// Helper function to get all model names from a Prisma Client instance
export function getModelNames(prismaClient: PrismaClientLike): string[] {
  const dmmf = getDMMF(prismaClient);
  if (!dmmf) return [];

  return dmmf.datamodel.models.map((model: any) => model.name);
}
