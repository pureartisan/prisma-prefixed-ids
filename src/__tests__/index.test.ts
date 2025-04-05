import { jest } from "@jest/globals";

import { PrismaClient } from "@prisma/client";
import { createPrefixedIdsExtension, extendPrismaClient } from "../index";

// Mock PrismaClient
jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $extends: jest.fn(),
    })),
  };
});

// Mock nanoid
jest.mock("nanoid", () => ({
  customAlphabet: jest.fn().mockImplementation(() => () => "mock_nanoid_value"),
}));

describe("PrefixedIdsExtension", () => {
  let prisma: PrismaClient;
  const mockQuery = jest.fn((args: any) => Promise.resolve(args));

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
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
        (prefix: string) => `${prefix}_custom_id`
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
});
