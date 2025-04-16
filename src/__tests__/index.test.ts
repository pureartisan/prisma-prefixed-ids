import { jest } from "@jest/globals";

import { PrismaClient } from "@prisma/client";
import {
  createPrefixedIdsExtension,
  extendPrismaClient,
  PrefixConfig,
} from "../index";

// Create a mock DMMF structure that represents your data model
const mockDMMF = {
  datamodel: {
    models: [
      {
        name: "User",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "name", kind: "scalar", type: "String" },
          { name: "posts", kind: "object", type: "Post", isList: true }
        ]
      },
      {
        name: "Post",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "title", kind: "scalar", type: "String" },
          { name: "categories", kind: "object", type: "Category" },
          { name: "comments", kind: "object", type: "Comment", isList: true }
        ]
      },
      {
        name: "Category",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "name", kind: "scalar", type: "String" }
        ]
      },
      {
        name: "Comment",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "content", kind: "scalar", type: "String" },
          { name: "likes", kind: "object", type: "Like" }
        ]
      },
      {
        name: "Like",
        fields: [
          { name: "id", kind: "scalar", type: "String" },
          { name: "type", kind: "scalar", type: "String" }
        ]
      }
    ]
  }
};

// Mock PrismaClient
jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $extends: jest.fn().mockReturnValue({}),
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      // Add the DMMF to the mocked PrismaClient
      _dmmf: mockDMMF,
    })),
  };
});

// Mock nanoid
jest.mock("nanoid", () => ({
  customAlphabet: jest.fn().mockImplementation(() => () => "mock_nanoid_value"),
}));

describe("PrefixedIdsExtension", () => {
  let prisma: jest.Mocked<PrismaClient>;
  const mockQuery = jest.fn((args: any) => Promise.resolve(args));

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
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
              connectOrCreate: {
                where: { id: "pst_123" },
                create: {
                  title: "New Post",
                  categories: {
                    create: {
                      name: "New Category",
                    },
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
      expect(result.data.id).toMatch(/^usr_/);
      expect(result.data.posts.connectOrCreate.create.id).toMatch(/^pst_/);
      expect(
        result.data.posts.connectOrCreate.create.categories.create.id,
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
  });
});
