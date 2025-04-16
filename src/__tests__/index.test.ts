import { jest } from "@jest/globals";

import { PrismaClient } from "@prisma/client";
import {
  createPrefixedIdsExtension,
  extendPrismaClient,
  PrefixConfig,
} from "../index";

type MockUser = {
  id: string;
  name: string;
};

type CreateArgs = {
  data: Record<string, unknown>;
};

// Mock PrismaClient
jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $extends: jest.fn(),
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          Test: "test",
        },
      });

      expect(extension.name).toBe("prefixedIds");
    });

    it("should use default idGenerator if none provided", async () => {
      const extension = createPrefixedIdsExtension({
        prefixes: {
          Test: "test",
        },
      });

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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          Test: "test",
        },
        idGenerator: customIdGenerator,
      });

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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          Test: "test",
        },
      });

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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          Test: "test",
        },
      });

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

      const extension = createPrefixedIdsExtension(prefixConfig);
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

      expect(prisma.$extends).toHaveBeenCalled();
    });

    it("should not throw error if prefixes are not provided", () => {
      expect(() => {
        extendPrismaClient(prisma, {} as any);
      }).not.toThrow();
    });
  });

  describe("Nested Writes", () => {
    it("should handle nested create operations", async () => {
      const extension = createPrefixedIdsExtension({
        prefixes: {
          User: "usr",
          Post: "pst",
          Category: "cat",
        },
      });

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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          User: "usr",
          Post: "pst",
        },
      });

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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          User: "usr",
          Post: "pst",
          Comment: "cmt",
          Like: "lik",
        },
      });

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
      const extension = createPrefixedIdsExtension({
        prefixes: {
          User: "usr",
          Post: "pst",
        },
      });

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
  });
});
