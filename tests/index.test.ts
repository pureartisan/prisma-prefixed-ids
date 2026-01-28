import { jest } from "@jest/globals";

import {
  createPrefixedIdsExtension,
  extendPrismaClient,
  PrefixConfig,
  findRelationModel,
  processNestedData,
  getModelNames,
  ModelName,
  PrismaClientLike,
} from "../src/index";

// Create a mock DMMF structure that represents your data model
const mockDMMF = {
  datamodel: {
    models: [
      {
        name: "User",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "name", kind: "scalar", type: "String" },
          { name: "posts", kind: "object", type: "Post", isList: true },
          { name: "comments", kind: "object", type: "Comment", isList: true },
        ],
      },
      {
        name: "Post",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "title", kind: "scalar", type: "String" },
          { name: "categories", kind: "object", type: "Category" },
          { name: "comments", kind: "object", type: "Comment", isList: true },
        ],
      },
      {
        name: "Category",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "name", kind: "scalar", type: "String" },
        ],
      },
      {
        name: "Comment",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "content", kind: "scalar", type: "String" },
          { name: "likes", kind: "object", type: "Like" },
        ],
      },
      {
        name: "Like",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "type", kind: "scalar", type: "String" },
        ],
      },
    ],
  },
};

// Factory to create mock PrismaClient
const createMockPrismaClient = (): PrismaClientLike => ({
  $extends: jest.fn().mockReturnValue({}),
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  // Add the DMMF to the mocked PrismaClient
  _dmmf: mockDMMF,
});

// Mock nanoid
jest.mock("nanoid", () => ({
  customAlphabet: jest.fn().mockImplementation(() => () => "mock_nanoid_value"),
}));

describe("PrefixedIdsExtension", () => {
  let prisma: PrismaClientLike;
  const mockQuery = jest.fn((args: any) => Promise.resolve(args));

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrismaClient();
  });

  describe("createPrefixedIdsExtension", () => {
    it("should create an extension with the correct name", () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            Test: "test",
          },
        },
        mockDMMF,
      );

      expect(extension.name).toBe("prefixedIds");
    });

    it("should use default idGenerator if none provided", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            Test: "test",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: { data: {} },
        query: mockQuery,
        model: "Test",
      });

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it("should use custom idGenerator if provided", async () => {
      const customIdGenerator = jest.fn(
        (prefix: string) => `${prefix}_custom_id`,
      );
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            Test: "test",
          },
          idGenerator: customIdGenerator,
        },
        mockDMMF,
      );

      await extension.query.$allModels.create({
        args: { data: {} },
        query: mockQuery,
        model: "Test",
      });

      expect(customIdGenerator).toHaveBeenCalledWith("test");
      expect(mockQuery).toHaveBeenCalledWith({
        data: { id: "test_custom_id" },
      });
    });

    it("should not modify args if model has no prefix", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            Test: "test",
          },
        },
        mockDMMF,
      );

      const originalArgs = { data: {} };
      const result = await extension.query.$allModels.create({
        args: originalArgs,
        query: mockQuery,
        model: "UnknownModel",
      });

      expect(result).toBeDefined();
      expect(result.data).not.toHaveProperty("id");
    });

    it("should handle createMany operation", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            Test: "test",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.createMany({
        args: {
          data: [{}, {}],
        },
        query: mockQuery,
        model: "Test",
      });

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty("id");
      expect(result.data[1]).toHaveProperty("id");
    });

    it("should use DMMF to handle nested relations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              create: [
                {
                  title: "Test Post 1",
                  categories: {
                    create: {
                      name: "Test Category",
                    },
                  },
                },
                {
                  title: "Test Post 2",
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.create[0].id).toMatch(/^pst_/);
      expect(result.data.posts.create[0].categories.create.id).toMatch(/^cat_/);
      expect(result.data.posts.create[1].id).toMatch(/^pst_/);
    });

    it("should throw error if DMMF is not provided", () => {
      expect(() => {
        createPrefixedIdsExtension(
          {
            prefixes: {
              Test: "test",
            },
          },
          undefined as any,
        );
      }).toThrow("DMMF is required for prefixed IDs extension");
    });

    it("should handle DMMF with missing model definitions", async () => {
      const incompleteDMMF = {
        datamodel: {
          models: [
            {
              name: "User",
              fields: [
                { name: "id", kind: "scalar", type: "String" },
                { name: "name", kind: "scalar", type: "String" },
              ],
            },
          ],
        },
      };

      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        incompleteDMMF as any,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
    });

    it("should generate IDs with uppercase letters", async (): Promise<void> => {
      const prefixConfig: PrefixConfig<"User"> = {
        prefixes: {
          User: "usr",
        },
        // Force an ID with uppercase for testing
        idGenerator: (prefix: string): string => {
          return `${prefix}_ABC123DEF`;
        },
      };

      const extension = createPrefixedIdsExtension(prefixConfig, mockDMMF);
      prisma.$extends(extension);

      // Mock the create operation
      prisma.user.create.mockResolvedValueOnce({
        id: "usr_ABC123DEF",
        name: "Test User",
      });

      const user = await prisma.user.create({
        data: {
          name: "Test User",
        },
      });

      // Test that the ID matches our pattern including uppercase
      expect(user.id).toMatch(/^usr_[A-Z0-9]+$/);
    });

    describe("Function-based prefixes", () => {
      it("should use function-based prefix when prefixes is a function", async () => {
        const prefixFunction = jest.fn((modelName: string) => {
          if (modelName === "User") return "usr";
          if (modelName === "Post") return "pst";
          return null;
        });

        const extension = createPrefixedIdsExtension(
          {
            prefixes: prefixFunction,
          },
          mockDMMF,
        );

        const result = await extension.query.$allModels.create({
          args: { data: {} },
          query: mockQuery,
          model: "User",
        });

        expect(prefixFunction).toHaveBeenCalledWith("User");
        expect(result.data.id).toMatch(/^usr_/);
        expect(mockQuery).toHaveBeenCalledWith({
          data: { id: expect.stringMatching(/^usr_/) },
        });
      });

      it("should handle function returning null for unknown models", async () => {
        const prefixFunction = jest.fn((modelName: string) => {
          if (modelName === "User") return "usr";
          return null;
        });

        const extension = createPrefixedIdsExtension(
          {
            prefixes: prefixFunction,
          },
          mockDMMF,
        );

        const result = await extension.query.$allModels.create({
          args: { data: {} },
          query: mockQuery,
          model: "UnknownModel",
        });

        expect(prefixFunction).toHaveBeenCalledWith("UnknownModel");
        expect(result.data).not.toHaveProperty("id");
        expect(mockQuery).toHaveBeenCalledWith({
          data: {},
        });
      });

      it("should use custom idGenerator with function-based prefix", async () => {
        const prefixFunction = jest.fn((modelName: string) => {
          if (modelName === "User") return "usr";
          return null;
        });

        const customIdGenerator = jest.fn(
          (prefix: string) => `${prefix}_custom_id`,
        );

        const extension = createPrefixedIdsExtension(
          {
            prefixes: prefixFunction,
            idGenerator: customIdGenerator,
          },
          mockDMMF,
        );

        await extension.query.$allModels.create({
          args: { data: {} },
          query: mockQuery,
          model: "User",
        });

        expect(prefixFunction).toHaveBeenCalledWith("User");
        expect(customIdGenerator).toHaveBeenCalledWith("usr");
        expect(mockQuery).toHaveBeenCalledWith({
          data: { id: "usr_custom_id" },
        });
      });

      it("should handle function-based prefix with createMany operation", async () => {
        const prefixFunction = jest.fn((modelName: string) => {
          if (modelName === "User") return "usr";
          return null;
        });

        const extension = createPrefixedIdsExtension(
          {
            prefixes: prefixFunction,
          },
          mockDMMF,
        );

        const result = await extension.query.$allModels.createMany({
          args: {
            data: [{}, {}],
          },
          query: mockQuery,
          model: "User",
        });

        expect(prefixFunction).toHaveBeenCalledTimes(2);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toMatch(/^usr_/);
        expect(result.data[1].id).toMatch(/^usr_/);
      });

      it("should handle function-based prefix with nested relations", async () => {
        const prefixFunction = jest.fn((modelName: string) => {
          if (modelName === "User") return "usr";
          if (modelName === "Post") return "pst";
          if (modelName === "Category") return "cat";
          return null;
        });

        const extension = createPrefixedIdsExtension(
          {
            prefixes: prefixFunction,
          },
          mockDMMF,
        );

        const result = await extension.query.$allModels.create({
          args: {
            data: {
              name: "Test User",
              posts: {
                create: [
                  {
                    title: "Test Post 1",
                    categories: {
                      create: {
                        name: "Test Category",
                      },
                    },
                  },
                  {
                    title: "Test Post 2",
                  },
                ],
              },
            },
          },
          query: mockQuery,
          model: "User",
        });

        expect(result.data).toBeDefined();
        expect(result.data.id).toMatch(/^usr_/);
        expect(result.data.posts.create[0].id).toMatch(/^pst_/);
        expect(result.data.posts.create[0].categories.create.id).toMatch(
          /^cat_/,
        );
        expect(result.data.posts.create[1].id).toMatch(/^pst_/);
      });

      it("should maintain backward compatibility with object-based prefixes", async () => {
        const extension = createPrefixedIdsExtension(
          {
            prefixes: {
              User: "usr",
              Post: "pst",
            },
          },
          mockDMMF,
        );

        const result = await extension.query.$allModels.create({
          args: { data: {} },
          query: mockQuery,
          model: "User",
        });

        expect(result.data.id).toMatch(/^usr_/);
        expect(mockQuery).toHaveBeenCalledWith({
          data: { id: expect.stringMatching(/^usr_/) },
        });
      });
    });
  });

  describe("Manual ID Preservation", () => {
    it("should preserve manually set ID in create operation", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            id: "my_custom_id",
            name: "Test User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toBe("my_custom_id");
      expect(result.data.name).toBe("Test User");
    });

    it("should preserve manually set ID in createMany operation", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.createMany({
        args: {
          data: [
            { id: "custom_id_1", name: "User 1" },
            { name: "User 2" },
            { id: "custom_id_3", name: "User 3" },
          ],
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toHaveLength(3);
      expect(result.data[0].id).toBe("custom_id_1");
      expect(result.data[1].id).toMatch(/^usr_/);
      expect(result.data[2].id).toBe("custom_id_3");
    });

    it("should preserve manually set ID in upsert create branch", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.upsert({
        args: {
          where: { email: "test@example.com" },
          create: {
            id: "my_upsert_id",
            name: "Upsert User",
            email: "test@example.com",
          },
          update: {
            name: "Updated User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.create.id).toBe("my_upsert_id");
      expect(result.create.name).toBe("Upsert User");
    });

    it("should preserve manually set ID in connectOrCreate create branch", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.connectOrCreate({
        args: {
          where: { email: "test@example.com" },
          create: {
            id: "my_connect_or_create_id",
            name: "ConnectOrCreate User",
            email: "test@example.com",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.create.id).toBe("my_connect_or_create_id");
    });

    it("should preserve manually set IDs in nested create operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            id: "my_user_id",
            name: "Test User",
            posts: {
              create: [
                {
                  id: "my_post_id_1",
                  title: "Custom Post 1",
                  categories: {
                    create: {
                      id: "my_category_id",
                      name: "Custom Category",
                    },
                  },
                },
                {
                  title: "Auto-generated Post",
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toBe("my_user_id");
      expect(result.data.posts.create[0].id).toBe("my_post_id_1");
      expect(result.data.posts.create[0].categories.create.id).toBe("my_category_id");
      expect(result.data.posts.create[1].id).toMatch(/^pst_/);
    });

    it("should preserve manually set IDs in nested createMany operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            id: "my_user_id",
            name: "Test User",
            posts: {
              createMany: {
                data: [
                  { id: "my_post_1", title: "Custom Post 1" },
                  { title: "Auto Post 2" },
                  { id: "my_post_3", title: "Custom Post 3" },
                ],
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toBe("my_user_id");
      expect(result.data.posts.createMany.data[0].id).toBe("my_post_1");
      expect(result.data.posts.createMany.data[1].id).toMatch(/^pst_/);
      expect(result.data.posts.createMany.data[2].id).toBe("my_post_3");
    });

    it("should preserve manually set IDs in nested upsert operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              upsert: {
                where: { id: "existing_post" },
                create: {
                  id: "my_upsert_post",
                  title: "Custom Upsert Post",
                },
                update: {
                  title: "Updated Post",
                },
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.upsert.create.id).toBe("my_upsert_post");
    });

    it("should preserve manually set IDs in nested connectOrCreate operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              connectOrCreate: [
                {
                  where: { id: "existing_post" },
                  create: {
                    id: "my_connect_create_post",
                    title: "Custom ConnectOrCreate Post",
                  },
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.connectOrCreate[0].create.id).toBe("my_connect_create_post");
    });

    it("should preserve manually set IDs in update operations with nested creates", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.update({
        args: {
          where: { id: "existing_user" },
          data: {
            posts: {
              create: [
                {
                  id: "my_update_post_1",
                  title: "Custom Update Post 1",
                },
                {
                  title: "Auto Update Post 2",
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.posts.create[0].id).toBe("my_update_post_1");
      expect(result.data.posts.create[1].id).toMatch(/^pst_/);
    });

    it("should preserve manually set IDs with mixed data types", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            id: 123, // Numeric ID
            name: "Test User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toBe(123);
    });

    it("should treat empty string ID as missing and generate prefixed ID", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            id: "", // Empty string ID is treated as falsy
            name: "Test User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toMatch(/^usr_/);
    });

    it("should treat zero as missing ID and generate prefixed ID", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            id: 0, // Zero ID is treated as falsy
            name: "Test User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data.id).toMatch(/^usr_/);
    });
  });

  describe("extendPrismaClient", () => {
    it("should extend the Prisma client with the extension", () => {
      const extendedPrisma = extendPrismaClient(prisma, {
        prefixes: {
          Test: "test",
        },
      });

      expect(extendedPrisma).toBeDefined();
      expect(prisma.$extends).toHaveBeenCalled();
    });

    it("should not throw error if prefixes are not provided", () => {
      expect(() => {
        extendPrismaClient(prisma, {} as any);
      }).not.toThrow();
    });

    it("should extract DMMF from _baseDmmf", () => {
      const prismaWithBaseDmmf = {
        ...prisma,
        _baseDmmf: mockDMMF,
      };

      extendPrismaClient(prismaWithBaseDmmf, {
        prefixes: { Test: "test" },
      });

      expect(prisma.$extends).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(Object),
        }),
      );
    });

    it("should extract DMMF from _dmmf", () => {
      const prismaWithDmmf = {
        ...prisma,
        _dmmf: mockDMMF,
      };

      extendPrismaClient(prismaWithDmmf, {
        prefixes: { Test: "test" },
      });

      expect(prisma.$extends).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(Object),
        }),
      );
    });

    it("should extract DMMF from _client._baseDmmf", () => {
      const prismaWithClientDmmf = {
        ...prisma,
        _client: {
          _baseDmmf: mockDMMF,
        },
      };

      extendPrismaClient(prismaWithClientDmmf, {
        prefixes: { Test: "test" },
      });

      expect(prisma.$extends).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(Object),
        }),
      );
    });

    it("should extract DMMF from _client._dmmf", () => {
      const prismaWithClientDmmf = {
        ...prisma,
        _client: {
          _dmmf: mockDMMF,
        },
      };

      extendPrismaClient(prismaWithClientDmmf, {
        prefixes: { Test: "test" },
      });

      expect(prisma.$extends).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(Object),
        }),
      );
    });

    it("should throw error if no DMMF can be found", () => {
      const prismaWithoutDmmf = {
        ...prisma,
        _baseDmmf: undefined,
        _dmmf: undefined,
        _client: undefined,
      };

      expect(() => {
        extendPrismaClient(prismaWithoutDmmf, {
          prefixes: { Test: "test" },
        });
      }).toThrow("DMMF is required for prefixed IDs extension");
    });
  });

  describe("Nested Writes", () => {
    it("should handle nested create operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              create: [
                {
                  title: "Test Post 1",
                  categories: {
                    create: {
                      name: "Test Category",
                    },
                  },
                },
                {
                  title: "Test Post 2",
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.create[0].id).toMatch(/^pst_/);
      expect(result.data.posts.create[0].categories.create.id).toMatch(/^cat_/);
      expect(result.data.posts.create[1].id).toMatch(/^pst_/);
    });

    it("should handle nested createMany operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              createMany: {
                data: [{ title: "Test Post 1" }, { title: "Test Post 2" }],
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.createMany.data[0].id).toMatch(/^pst_/);
      expect(result.data.posts.createMany.data[1].id).toMatch(/^pst_/);
    });

    it("should handle deep nested creates", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Comment: "cmt",
            Like: "lik",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              create: [
                {
                  title: "Test Post",
                  comments: {
                    create: [
                      {
                        content: "Test Comment",
                        likes: {
                          create: {
                            type: "like",
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.create[0].id).toMatch(/^pst_/);
      expect(result.data.posts.create[0].comments.create[0].id).toMatch(
        /^cmt_/,
      );
      expect(
        result.data.posts.create[0].comments.create[0].likes.create.id,
      ).toMatch(/^lik_/);
    });

    it("should not modify existing IDs in nested structures", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              create: [
                {
                  id: "custom_post_id",
                  title: "Test Post",
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.create[0].id).toBe("custom_post_id");
    });

    it("should handle nested createMany operations", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              createMany: {
                data: [{ title: "Test Post 1" }, { title: "Test Post 2" }],
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.createMany.data[0].id).toMatch(/^pst_/);
      expect(result.data.posts.createMany.data[1].id).toMatch(/^pst_/);
    });

    it("should handle update operation with nested creates", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.update({
        args: {
          where: { id: "usr_123" },
          data: {
            name: "Updated User",
            posts: {
              create: [
                {
                  title: "New Post",
                  categories: {
                    create: {
                      name: "New Category",
                    },
                  },
                },
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.posts.create[0].id).toMatch(/^pst_/);
      expect(result.data.posts.create[0].categories.create.id).toMatch(/^cat_/);
    });

    it("should handle updateMany operation with nested creates", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.updateMany({
        args: {
          where: { name: "Test User" },
          data: {
            posts: {
              createMany: {
                data: [{ title: "New Post 1" }, { title: "New Post 2" }],
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.posts.createMany.data[0].id).toMatch(/^pst_/);
      expect(result.data.posts.createMany.data[1].id).toMatch(/^pst_/);
    });

    it("should handle upsert operation with nested creates", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              upsert: {
                where: { id: "pst_123" },
                create: {
                  title: "New Post",
                  categories: {
                    create: {
                      name: "New Category",
                    },
                  },
                },
                update: {
                  title: "Updated Post",
                },
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.upsert.create.id).toMatch(/^pst_/);
      expect(result.data.posts.upsert.create.categories.create.id).toMatch(
        /^cat_/,
      );
    });

    it("should handle connectOrCreate operation with nested creates", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              connectOrCreate: [
                {
                  where: { id: "pst_123" },
                  create: {
                    title: "New Post",
                    categories: {
                      create: {
                        name: "New Category",
                      },
                    },
                  },
                }
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.connectOrCreate[0].create.id).toMatch(/^pst_/);
      expect(
        result.data.posts.connectOrCreate[0].create.categories.create.id,
      ).toMatch(/^cat_/);
    });

    it("should handle complex nested operations in update", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
            Comment: "cmt",
            Like: "lik",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.update({
        args: {
          where: { id: "usr_123" },
          data: {
            posts: {
              create: {
                title: "New Post",
                categories: {
                  create: {
                    name: "New Category",
                  },
                },
                comments: {
                  createMany: {
                    data: [
                      {
                        content: "Comment 1",
                        likes: {
                          create: {
                            type: "like",
                          },
                        },
                      },
                      {
                        content: "Comment 2",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.posts.create.id).toMatch(/^pst_/);
      expect(result.data.posts.create.categories.create.id).toMatch(/^cat_/);
      expect(result.data.posts.create.comments.createMany.data[0].id).toMatch(
        /^cmt_/,
      );
      expect(
        result.data.posts.create.comments.createMany.data[0].likes.create.id,
      ).toMatch(/^lik_/);
      expect(result.data.posts.create.comments.createMany.data[1].id).toMatch(
        /^cmt_/,
      );
    });

    it("should handle nested writes with mixed operations (connect/disconnect)", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Category: "cat",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.update({
        args: {
          where: { id: "usr_123" },
          data: {
            posts: {
              create: {
                title: "New Post",
                categories: {
                  create: {
                    name: "New Category",
                  },
                },
              },
              connect: [{ id: "pst_existing" }],
              disconnect: [{ id: "pst_old" }],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.posts.create.id).toMatch(/^pst_/);
      expect(result.data.posts.create.categories.create.id).toMatch(/^cat_/);
      expect(result.data.posts.connect).toEqual([{ id: "pst_existing" }]);
      expect(result.data.posts.disconnect).toEqual([{ id: "pst_old" }]);
    });

    it("should handle root-level relation operations with nested create in data", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      // Test create operation with both direct data and nested creates
      const createResult = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              create: [{ title: "Post 1" }, { title: "Post 2" }],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(createResult.data).toBeDefined();
      expect(createResult.data.id).toMatch(/^usr_/);
      expect(createResult.data.posts.create[0].id).toMatch(/^pst_/);
      expect(createResult.data.posts.create[1].id).toMatch(/^pst_/);
    });

    it("should handle edge cases with empty arrays and objects", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              createMany: {
                data: [], // Empty array
              },
              create: {}, // Empty object should get ID
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.createMany.data).toEqual([]);
      expect(result.data.posts.create.id).toMatch(/^pst_/);
    });

    it("should handle deeply nested createMany with different models", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Comment: "cmt",
            Like: "lik",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "Test User",
            posts: {
              createMany: {
                data: [
                  {
                    title: "Post 1",
                    comments: {
                      createMany: {
                        data: [
                          {
                            content: "Comment 1",
                            likes: {
                              createMany: {
                                data: [{ type: "like" }, { type: "love" }],
                              },
                            },
                          },
                          {
                            content: "Comment 2",
                          },
                        ],
                      },
                    },
                  },
                  {
                    title: "Post 2",
                  },
                ],
              },
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.createMany.data).toHaveLength(2);
      expect(result.data.posts.createMany.data[0].id).toMatch(/^pst_/);
      expect(result.data.posts.createMany.data[1].id).toMatch(/^pst_/);
      expect(
        result.data.posts.createMany.data[0].comments.createMany.data,
      ).toHaveLength(2);
      expect(
        result.data.posts.createMany.data[0].comments.createMany.data[0].id,
      ).toMatch(/^cmt_/);
      expect(
        result.data.posts.createMany.data[0].comments.createMany.data[1].id,
      ).toMatch(/^cmt_/);
      expect(
        result.data.posts.createMany.data[0].comments.createMany.data[0].likes
          .createMany.data,
      ).toHaveLength(2);
      expect(
        result.data.posts.createMany.data[0].comments.createMany.data[0].likes
          .createMany.data[0].id,
      ).toMatch(/^lik_/);
      expect(
        result.data.posts.createMany.data[0].comments.createMany.data[0].likes
          .createMany.data[1].id,
      ).toMatch(/^lik_/);
    });

    it("should handle upsert operations with nested creates in create branch", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Comment: "cmt",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.upsert({
        args: {
          where: { id: "usr_123" },
          create: {
            name: "New User",
            posts: {
              createMany: {
                data: [{ title: "Post 1" }, { title: "Post 2" }],
              },
            },
          },
          update: {
            name: "Updated User",
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result).toBeDefined();
      expect(result.create.id).toMatch(/^usr_/);
      expect(result.create.name).toBe("New User");
      // The posts operations are processed and get IDs
      expect(result.create.posts.createMany.data).toHaveLength(2);
      expect(result.create.posts.createMany.data[0].title).toBe("Post 1");
      expect(result.create.posts.createMany.data[1].title).toBe("Post 2");
    });

    it("should handle connectOrCreate operations in nested writes", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Comment: "cmt",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.create({
        args: {
          data: {
            name: "New User",
            posts: {
              connectOrCreate: [
                {
                  where: { id: "pst_existing" },
                  create: {
                    title: "New Post",
                    comments: {
                      create: {
                        content: "Comment 1",
                      },
                    },
                  },
                }
              ],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.connectOrCreate[0].create.id).toMatch(/^pst_/);
      expect(
        result.data.posts.connectOrCreate[0].create.comments.create.id,
      ).toMatch(/^cmt_/);
    });

    it("should preserve non-create operations in complex nested writes", async () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
            Post: "pst",
            Comment: "cmt",
          },
        },
        mockDMMF,
      );

      const result = await extension.query.$allModels.update({
        args: {
          where: { id: "usr_123" },
          data: {
            posts: {
              create: {
                title: "New Post",
                comments: {
                  create: {
                    content: "New Comment",
                  },
                },
              },
              update: {
                where: { id: "pst_existing" },
                data: {
                  title: "Updated Post",
                  comments: {
                    updateMany: {
                      where: { content: "old" },
                      data: { content: "updated" },
                    },
                    deleteMany: {
                      where: { content: "delete" },
                    },
                    connect: [{ id: "cmt_connect" }],
                    disconnect: [{ id: "cmt_disconnect" }],
                  },
                },
              },
              delete: [{ id: "pst_delete" }],
              connect: [{ id: "pst_connect" }],
              disconnect: [{ id: "pst_disconnect" }],
            },
          },
        },
        query: mockQuery,
        model: "User",
      });

      expect(result.data).toBeDefined();
      expect(result.data.posts.create.id).toMatch(/^pst_/);
      expect(result.data.posts.create.comments.create.id).toMatch(/^cmt_/);

      // Verify non-create operations are preserved without modification
      expect(result.data.posts.update).toEqual({
        where: { id: "pst_existing" },
        data: {
          title: "Updated Post",
          comments: {
            updateMany: {
              where: { content: "old" },
              data: { content: "updated" },
            },
            deleteMany: {
              where: { content: "delete" },
            },
            connect: [{ id: "cmt_connect" }],
            disconnect: [{ id: "cmt_disconnect" }],
          },
        },
      });
      expect(result.data.posts.delete).toEqual([{ id: "pst_delete" }]);
      expect(result.data.posts.connect).toEqual([{ id: "pst_connect" }]);
      expect(result.data.posts.disconnect).toEqual([{ id: "pst_disconnect" }]);
    });
  });

  describe("findRelationModel", () => {
    it("should return null when model is not found in DMMF", () => {
      const result = findRelationModel(mockDMMF, "NonExistentModel", "posts");
      expect(result).toBeNull();
    });

    it("should return null when field is not found in model", () => {
      const result = findRelationModel(mockDMMF, "User", "nonExistentField");
      expect(result).toBeNull();
    });

    it("should return null when field is not an object type", () => {
      const result = findRelationModel(mockDMMF, "User", "name");
      expect(result).toBeNull();
    });
  });

  describe("processNestedData", () => {
    it("should handle nested data with non-object values", () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = processNestedData(
        {
          name: "Test User",
          age: 30,
          isActive: true,
        },
        "User",
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        age: 30,
        isActive: true,
        id: "usr_123",
      });
    });

    it("should handle nested data with null values", () => {
      const extension = createPrefixedIdsExtension(
        {
          prefixes: {
            User: "usr",
          },
        },
        mockDMMF,
      );

      const result = processNestedData(
        {
          name: "Test User",
          posts: null,
        },
        "User",
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        posts: null,
        id: "usr_123",
      });
    });

    it("should handle primitive data types", () => {
      const result = processNestedData(
        "string value",
        "User",
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );
      expect(result).toBe("string value");
    });

    it("should handle array of primitive values", () => {
      const result = processNestedData(
        [1, 2, 3],
        "User",
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );
      expect(result).toEqual([1, 2, 3]);
    });

    it("should handle nested data with relation operations", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            create: {
              title: "Test Post",
              categories: {
                create: {
                  name: "Test Category",
                },
              },
            },
            update: {
              title: "Updated Post",
            },
            upsert: {
              where: { id: "pst_123" },
              create: {
                title: "New Post",
              },
              update: {
                title: "Updated Post",
              },
            },
            connectOrCreate: [
              {
                where: { id: "pst_123" },
                create: {
                  title: "New Post",
                },
              }
            ],
          },
        },
        "User" as ModelName,
        (model) => {
          switch (model) {
            case "User":
              return "usr_123";
            case "Post":
              return "pst_456";
            case "Category":
              return "cat_789";
            default:
              return null;
          }
        },
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          create: {
            title: "Test Post",
            id: "pst_456",
            categories: {
              create: {
                name: "Test Category",
                id: "cat_789",
              },
            },
          },
          update: {
            title: "Updated Post",
          },
          upsert: {
            where: { id: "pst_123" },
            create: {
              title: "New Post",
              id: "pst_456",
            },
            update: {
              title: "Updated Post",
            },
          },
          connectOrCreate: [
            {
              where: { id: "pst_123" },
              create: {
                title: "New Post",
                id: "pst_456",
              },
            }
          ],
        },
      });
    });

    it("should handle nested data with createMany operation", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            createMany: {
              data: [{ title: "Post 1" }, { title: "Post 2" }],
            },
          },
        },
        "User" as ModelName,
        (model) => {
          switch (model) {
            case "User":
              return "usr_123";
            case "Post":
              return "pst_456";
            default:
              return null;
          }
        },
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          createMany: {
            data: [
              { title: "Post 1", id: "pst_456" },
              { title: "Post 2", id: "pst_456" },
            ],
          },
        },
      });
    });

    it("should handle nested data with no relation fields", () => {
      const result = processNestedData(
        {
          name: "Test User",
          age: 30,
          nonRelationField: {
            someData: "test",
          },
        },
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        age: 30,
        nonRelationField: {
          someData: "test",
        },
        id: "usr_123",
      });
    });

    it("should handle nested data with relation field but no operations", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            someData: "test",
          },
        },
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          someData: "test",
        },
      });
    });

    it("should handle nested data with relation operation but no matching relation field", () => {
      const result = processNestedData(
        {
          name: "Test User",
          create: {
            title: "Test Post",
          },
        },
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        create: {
          title: "Test Post",
        },
      });
    });

    it("should handle nested data with relation field but invalid operation", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            invalidOp: {
              title: "Test Post",
            },
          },
        },
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          invalidOp: {
            title: "Test Post",
          },
        },
      });
    });

    it("should handle createMany with non-array data", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            createMany: {
              data: "invalid",
            },
          },
        },
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          createMany: {
            data: "invalid",
          },
        },
      });
    });

    it("should handle relation field with no model found", () => {
      const result = processNestedData(
        {
          name: "Test User",
          unknownRelation: {
            create: {
              title: "Test",
            },
          },
        },
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        unknownRelation: {
          create: {
            title: "Test",
          },
        },
      });
    });

    it("should handle undefined data", () => {
      const result = processNestedData(
        undefined,
        "User" as ModelName,
        (model) => (model === "User" ? "usr_123" : null),
        mockDMMF,
      );

      expect(result).toBeUndefined();
    });

    it("should handle nested data with multiple relation fields", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            create: {
              title: "Test Post",
            },
          },
          comments: {
            create: {
              content: "Test Comment",
            },
          },
        },
        "User" as ModelName,
        (model) => {
          switch (model) {
            case "User":
              return "usr_123";
            case "Post":
              return "pst_456";
            case "Comment":
              return "cmt_789";
            default:
              return null;
          }
        },
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          create: {
            title: "Test Post",
            id: "pst_456",
          },
        },
        comments: {
          create: {
            content: "Test Comment",
            id: "cmt_789",
          },
        },
      });
    });

    it("should handle nested data with multiple relation operations on same field", () => {
      const result = processNestedData(
        {
          name: "Test User",
          posts: {
            create: {
              title: "Test Post",
            },
            createMany: {
              data: [{ title: "Post 1" }, { title: "Post 2" }],
            },
            update: {
              title: "Updated Post",
            },
          },
        },
        "User" as ModelName,
        (model) => {
          switch (model) {
            case "User":
              return "usr_123";
            case "Post":
              return "pst_456";
            default:
              return null;
          }
        },
        mockDMMF,
      );

      expect(result).toEqual({
        name: "Test User",
        id: "usr_123",
        posts: {
          create: {
            title: "Test Post",
            id: "pst_456",
          },
          createMany: {
            data: [
              { title: "Post 1", id: "pst_456" },
              { title: "Post 2", id: "pst_456" },
            ],
          },
          update: {
            title: "Updated Post",
          },
        },
      });
    });
  });

  describe("getModelNames", () => {
    it("should return empty array when DMMF is not available", () => {
      const prismaWithoutDmmf = {
        _baseDmmf: undefined,
        _dmmf: undefined,
        _client: undefined,
      };

      const result = getModelNames(prismaWithoutDmmf as any);
      expect(result).toEqual([]);
    });

    it("should return model names from DMMF", () => {
      const prismaWithDmmf = {
        _baseDmmf: mockDMMF,
      };

      const result = getModelNames(prismaWithDmmf as any);
      expect(result).toEqual(["User", "Post", "Category", "Comment", "Like"]);
    });
  });
});
